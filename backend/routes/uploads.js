const express = require("express");

const router = express.Router();

router.post("/", (req, res) => {
  if (!req.body.dataUrl) {
    return res.status(400).json({ error: "Missing image data." });
  }

  return res.status(201).json({ url: req.body.dataUrl });
});

module.exports = router;
