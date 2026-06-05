const { createUploadthing } = require("uploadthing/express");

const f = createUploadthing();

exports.ourFileRouter = {
    imageUploader: f({
         image: {
             maxFileSize: "4MB", 
             maxFileCount: 5
             } 
            })
            .middleware(async (req) => {
                return { userId: "user_123" };
            })
            .onUploadComplete(async ({ metadata, file }) => {
                console.log("Upload complete:", file.url);
            }),
        };
    