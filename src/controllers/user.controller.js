import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { User } from "../models/user.model.js";
import { uploadOnCloudinary } from "../utils/Cloudinary.js";
import jwt from 'jsonwebtoken';


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

    const isPasswordValid = await user.isPasswrodCorrect(password)
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

export {registerUser, loginUser, logoutUser, refreshAccessToken}

