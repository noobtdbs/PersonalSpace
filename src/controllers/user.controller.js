import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { User } from "../models/user.model.js";
import { uploadOnCloudinary } from "../utils/Cloudinary.js";
import jwt from 'jsonwebtoken';
import fs from 'fs';


const generateAccessAndRefreshToken = async(userId)=>{
    try {
        const user = await User.findById(userId)
        const accessToken = user.generateAccessToken()
        const refreshToken = user.generateRefreshToken()
    
        user.refreshToken = refreshToken
        await user.save( { validateBeforeSave: false })
    
        return {accessToken, refreshToken}
    } catch (error) {
        throw new ApiError(500, "something went wrong while generating the access and refresh tokens ! ")
    }
}

const registerUser = asyncHandler(async (req, res)=>{
    // console.log(req.body);
    
    const {fullName, username, email, password} = req.body
    // console.log(email);

    if([fullName, username, email, password].some((field)=> field?.trim()==="")){
        throw new ApiError(400, "All fields are required.")
    }

    const existedUser = await User.findOne({
        $or: [{username}, {email}]
    })

    if(existedUser)throw new ApiError(409, "User with email or username already exists!!")

    // console.log(req.files)
    const avatarLocalPath = req.files?.avatar[0]?.path

    // const coverImageLocalPath = req.files?.coverImage[0]?.path
    let coverImageLocalPath;
    if (req.files && Array.isArray(req.files.coverImage) && req.files.coverImage.length > 0) {
        coverImageLocalPath = req.files.coverImage[0].path
    }

    if(!avatarLocalPath)throw new ApiError(400, "Avatar File is Required!")
    
    const avatar =await uploadOnCloudinary(avatarLocalPath)
    const coverImage =await uploadOnCloudinary(coverImageLocalPath)

    if(!avatar)throw new ApiError(400, "Avatar File is Required ! ")

    const user = await User.create({
        fullName,
        avatar: avatar.url,
        coverImage: coverImage?.url || "",
        email,
        password,
        username: username.toLowerCase()
    })

    const createdUser = await User.findById(user._id).select("-password -refreshToken")

    if(!createdUser)throw new ApiError(500, "Something went wrong on the server side while registering a user !! ")

    return res.status(201).json(
        new ApiResponse(createdUser, "User registered Successfully", 200)
    )

    
})

const loginUser = asyncHandler(async(req, res)=>{

    const {email, username, password} = req.body
    if(!username && !email)throw new ApiError(400, "Username or email field is required!")
    
    const user = await User.findOne({
        $or: [{email}, {username}]
    })

    if(!user)throw new ApiError(404, "User is not registered!")

    const isPasswordValid = await user.isPasswordCorrect(password)
    if(!isPasswordValid)throw new ApiError(401, "Invalid user credentials ! ")
    
    const {accessToken, refreshToken} = await generateAccessAndRefreshToken(user._id)

    const loggedInUser = await User.findById(user._id).select("-password -refreshToken")

    const options = {
        httpOnly: true,
        secure: true
    }

    return res
    .status(200)
    .cookie("accessToken", accessToken, options)
    .cookie("refreshToken", refreshToken, options)
    .json(
        new ApiResponse(
            {
                user: loggedInUser, accessToken, refreshToken
            },
            "User logged in successfully ! ",
            200
        )
    )


    
})

const logoutUser = asyncHandler(async (req, res)=>{
    await User.findByIdAndUpdate(
        req.user._id,
        {
            $set: {
                refreshToken: undefined
            }
        },
        {
            new: true
        }
    )

    const options = {
        httpOnly: true,
        secure: true
    }

    return res
    .status(200)
    .clearCookie("accessToken", options)
    .clearCookie("refreshToken", options)
    .json(new ApiResponse({}, "Logged Out Successfully!!", 200))
})

const refreshAccessToken = asyncHandler(async(req, res)=>{
    const incomingRefreshToken = req.cookies.refreshToken || req.body.refreshToken
    if(!incomingRefreshToken)throw new ApiError(401, "Unauthorized Request!")

    try {
        const decodedToken = jwt.verify(
            incomingRefreshToken, 
            process.env.REFRESH_TOKEN_SECRET
        )
    
        const user = await User.findById(decodedToken?._id)
    
        if(!user)throw new ApiError(401, "Invalid Refresh Token")
    
        if(incomingRefreshToken !== user?.refreshToken){
            throw new ApiError(401, "Refresh Token is expired or used!!")
        }
    
        const options = {
            httpOnly: true,
            secure: true
        }
    
        const {accessToken, newRefreshToken} = await generateAccessAndRefreshToken(user._id)
    
        return res
        .status(200)
        .cookie("accessToken", accessToken, options)
        .cookie("refreshToken", newRefreshToken, options)
        .json(
            new ApiResponse(
                {accessToken, refreshToken: newRefreshToken},
                "Access Token refreshed !",
                200
            )
        )
    } catch (error) {
        throw new ApiError(401, error?.message || "Invalid Refresh Token")
    }

})

const changeCurrentPassword = asyncHandler(async(req, res)=>{
    const {oldPassword, newPassword} = req.body

    const user = await User.findById(req.user?._id)
    const isPasswordCorrect = await user.isPasswordCorrect(oldPassword)

    if(!isPasswordCorrect)throw new ApiError(400, "Old password does not match!!")

    user.password = newPassword

    await user.save({validateBeforeSave: false})

    return res.status(200)
    .json(new ApiResponse({}, "Password changed Successfully!", 200))



})

const getCurrentUser = asyncHandler(async(req, res)=>{
    return res.status(200)
    .json(new ApiResponse(req.user, "User details Fetched Successfully!", 200))
})

const updateAccountDetails = asyncHandler(async(req, res)=>{
    const {fullName, email}=req.body
    if(!fullName && !email)throw new ApiError(400, "Both fields are necessary!!")

    const user = await User.findByIdAndUpdate(
        req.user?._id,
        {
            $set:{fullName, email}
        },
        {new: true}
    ).select("-password")

    return res.status(200)
    .json(new ApiResponse(user, "User data updated Successfully !", 200))
})

const deleteFile = (filePath, retries = 3) => {
    fs.unlink(filePath, (err) => {
        if (err) {
            if (retries > 0) {
                console.error(`Retrying deletion of file: ${filePath}. Retries left: ${retries}`, err);
                return deleteFile(filePath, retries - 1);
            } else {
                console.error(`Failed to delete file after multiple attempts: ${filePath}`, err);
                // Optionally, queue the file for later deletion
                queueFileForDeletion(filePath);
            }
        } else {
            console.log(`Successfully deleted local file: ${filePath}`);
        }
    });
};

const updateUserAvatar = asyncHandler(async (req, res) => {
    const avatarLocalPath = req.file?.path;
    if (!avatarLocalPath) throw new ApiError(400, "Avatar File is missing!!");

    const avatar = await uploadOnCloudinary(avatarLocalPath);

    if (!avatar.url) throw new ApiError(400, "Error while fetching URL from Cloudinary!!");

    const user = await User.findByIdAndUpdate(
        req.user?._id,
        { $set: { avatar: avatar.url } },
        { new: true }
    ).select("-password");

    // Delete the local file after successful database update
    deleteFile(avatarLocalPath);

    return res.status(200)
        .json(new ApiResponse(user, "Avatar updated successfully!", 200));
});

const updateUserCoverImage = asyncHandler(async (req, res) => {
    const coverImageLocalPath = req.file?.path;
    if (!coverImageLocalPath) throw new ApiError(400, "Cover Image file is missing!!");

    const coverImage = await uploadOnCloudinary(coverImageLocalPath);

    if (!coverImage.url) throw new ApiError(400, "Error while fetching URL from Cloudinary!!");

    const user = await User.findByIdAndUpdate(
        req.user?._id,
        { $set: { coverImage: coverImage.url } },
        { new: true }
    ).select("-password");

    // Delete the local file after successful database update
    deleteFile(coverImageLocalPath);

    return res.status(200)
        .json(new ApiResponse(user, "Cover Image updated successfully!", 200));
});

const getUserChannelProfile = asyncHandler(async(req, res)=>{
    const {username} = req.params
    if(!username?.trim())throw new ApiError(400, "username is missing!!")
        
    const channel = await User.aggregate([
        // first pipeline to match the username in the database
        {
            $match:{
                username: username?.toLowerCase()
            }
        },
        // second pipeline to count the subscribers
        {
            $lookup:{
                from: "subscriptions", //  name that is saved on mongodb database
                localField: "_id",
                foreignField: "channel",
                as: "subscribers"
            }
        },
        // count the subscribed account
        {
            $lookup: {
                from: "subscriptions", //  name that is saved on mongodb database
                localField: "_id",
                foreignField: "subscriber",
                as: "subscribedTo"
            }
        },
        // now add this two things in the main user database schema
        {
            $addFields:{
                subscribersCount:{
                    $size: "$subscribers"
                },
                channelsSubscribedToCount:{
                    $size: "$subscribedTo"
                },
                isSubscribed: {
                    $cond: {
                        if: {$in: [req.user?._id, "$subscribers.subscriber"]},
                        then: true,
                        else: false
                    }
                }
            }
        },
        {
            $project:{
                fullName: 1,
                username: 1,
                email: 1,
                avatar: 1,
                coverImage: 1,
                subscribersCount: 1,
                channelsSubscribedToCount:1,
                isSubscribed: 1,
                createdAt: 1,
            }
        }
    ])
    console.log(channel)

    if(!channel?.length)throw new ApiError(404, "channel does not exist!!")

    return res
    .status(200)
    .json(
        new ApiResponse(channel[0], "user channel fetched  successfully!!", 200)
    )

})


export {registerUser, loginUser, logoutUser, refreshAccessToken, changeCurrentPassword, getCurrentUser, updateAccountDetails,
    updateUserAvatar, updateUserCoverImage, getUserChannelProfile}

    
