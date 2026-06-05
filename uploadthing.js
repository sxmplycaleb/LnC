const { createUploadthing } = require("uploadthing/server");

const f = createUploadthing();

const ourFileRouter = {
    productImage: f({ image: { maxFileSize: "4MB" } })
    .onUploadComplete((data) => {
        console.log("Upload complete");
    }),
};

module.exports = { ourFileRouter };