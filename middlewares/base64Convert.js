import { v4 as uuidv4 } from "uuid";
import { saveFile, deleteFile } from "../utils/storageUtils.js";

export const deleteFromFirebase = async (url) => {
  try {
    if (!url || typeof url !== "string") return;
    await deleteFile(url);
  } catch (error) {
    console.error("Error deleting file:", error);
  }
};

export const processBase64Image = async (base64Image) => {
  try {
    if (!base64Image || typeof base64Image !== "string") {
      return null;
    }

    if (!base64Image.startsWith("data:image")) {
      base64Image = `data:image/jpeg;base64,${base64Image}`;
    }

    const base64Data = base64Image.replace(/^data:image\/\w+;base64,/, "");

    if (!base64Data || base64Data.trim() === "") {
      return null;
    }

    const buffer = Buffer.from(base64Data, "base64");
    // Uploaded to AWS S3
    const downloadURL = await saveFile(buffer, 'images', `${uuidv4()}.jpg`);
    return downloadURL;
  } catch (error) {
    console.error("Error processing image:", error);
    throw new Error(`Error processing image: ${error.message}`);
  }
};

export const processBase64Video = async (base64Video) => {
  try {
    if (!base64Video || typeof base64Video !== "string") {
      return null;
    }

    const mimeMatch = base64Video.match(/^data:(video\/\w+);base64,/);
    const base64Data = base64Video.replace(/^data:video\/\w+;base64,/, "");
    const buffer = Buffer.from(base64Data, "base64");
    
    const extension = mimeMatch ? mimeMatch[1].split('/')[1] : 'mp4';
    const fileName = `${uuidv4()}.${extension}`;

    // Uploaded to AWS S3
    const downloadURL = await saveFile(buffer, 'videos', fileName);
    return downloadURL;
  } catch (error) {
    console.error("Error processing video:", error);
    throw new Error(`Error processing video: ${error.message}`);
  }
};

export const processBase64File = async (base64DataString, subFolder = 'documents') => {
  try {
    if (!base64DataString || typeof base64DataString !== "string") {
      return null;
    }

    const mimeMatch = base64DataString.match(/^data:([^;]+);base64,/);
    const base64Data = base64DataString.replace(/^data:[^;]+;base64,/, "");
    const buffer = Buffer.from(base64Data, "base64");
    
    let extension = 'bin';
    if (mimeMatch) {
      const mimeType = mimeMatch[1];
      extension = mimeType.split('/')[1] || 'bin';
      // Normalize common extensions
      if (mimeType === 'application/pdf') extension = 'pdf';
      if (mimeType.includes('msword') || mimeType.includes('wordprocessingml')) extension = 'docx';
    }
    
    const fileName = `${uuidv4()}.${extension}`;

    // Uploaded to AWS S3
    const downloadURL = await saveFile(buffer, subFolder, fileName);
    return downloadURL;
  } catch (error) {
    console.error("Error processing file:", error);
    throw new Error(`Error processing file: ${error.message}`);
  }
};


