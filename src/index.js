
import dotenv from 'dotenv'
import connectDB from "./db/index.js";


// import express from 'express';
// const app = express()

// (async()=>{
//     try {
//         await mongoose.connect(`${process.env.MONGODB_URI}/${DB_NAME}`)
//         app.on("error", (e)=>{
//             console.log(e);
//             throw e;
//         })
//         app.listen(process.env.PORT, ()=> {
//             console.log(`server listening on PORT ${process.env.PORT}`);
//         })

//     } catch (error) {
//         console.log(error);
//         throw error
        
//     }

// })()

dotenv.config({path: './env'})

connectDB()