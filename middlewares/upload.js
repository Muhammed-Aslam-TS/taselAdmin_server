// src/middlewares/upload.js
import multer from 'multer';
import path from 'path';

// Set up storage for uploaded files
// Set up storage for uploaded files
const storage = multer.memoryStorage();

// Create the multer instance with increased field size limits
// This is needed because base64 encoded images can be very large
// Products can have many fields: name, price, description, features, colors, sizes, specifications, flowers, images, etc.
const upload = multer({ 
  storage: storage,
  limits: {
    fieldSize: 500 * 1024 * 1024, // 500MB field size limit (for base64 images)
    fileSize: 500 * 1024 * 1024,  // 500MB file size limit
    fields: 100,                  // Maximum number of non-file fields (increased for complex products)
    files: 20,                    // Maximum number of file fields
    parts: 120,                   // Maximum number of parts (fields + files)
  }
});

console.log('✅ Multer initialized with 500MB limits');

export default upload;