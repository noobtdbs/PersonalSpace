import { v2 as cloudinary } from 'cloudinary';
import fs from "fs"; // fs =filesystem of nodejs built in library

// Configuration

cloudinary.config({ 
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME, 
    api_key: process.env.CLOUDINARY_API_KEY, 
    api_secret: process.env.CLOUDINARY_API_SECRET 
});

// Upload a file
     
const uploadOnCloudinary = async (localFilePath)=>{
    try {
        if(!localFilePath)return null;
        const response = await cloudinary.uploader.upload(localFilePath, {
            resource_type: 'auto'
        })
        console.log("File uploaded to cloudinary", response.url);
        return response;
        
    } catch (error) {
        fs.unlinkSync(localFilePath)
        return null;
    }
}

export {uploadOnCloudinary}

