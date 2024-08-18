
// Pattern 1: Async await type--->

// const asyncHandler = (requestHandlerFunction) => async (req, res, next)=>{
//     try {
//         await requestHandlerFunction(req, res, next)
//     } catch (error) {
//         res.status(error.code || 500).json({
//             success: false,
//             message: error.message
//         })
//     }
// }

// Pattern 2: Promises Type ---->

const asyncHandler = (requestHandlerFunction) =>{
    return (req, res, next)=>{
        Promise.resolve(requestHandlerFunction(req, res, next))
        .catch((error)=>next(error))
    }
}


export {asyncHandler}

