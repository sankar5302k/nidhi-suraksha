import mongoose from 'mongoose';
import { StorageProvider } from './StorageProvider.js';

export class GridFsStorageProvider implements StorageProvider {
  private bucketName: string;

  constructor(bucketName = 'fdr_documents') {
    this.bucketName = bucketName;
  }

  private getBucket(): mongoose.mongo.GridFSBucket {
    const db = mongoose.connection.db;
    if (!db) {
      throw new Error('MongoDB connection is not open for GridFS operations.');
    }
    return new mongoose.mongo.GridFSBucket(db, { bucketName: this.bucketName });
  }

  async upload(key: string, data: Buffer, mimeType: string): Promise<void> {
    const bucket = this.getBucket();
    return new Promise((resolve, reject) => {
      const uploadStream = bucket.openUploadStream(key, {
        contentType: mimeType,
        metadata: { uploadedAt: new Date() }
      });

      uploadStream.on('error', reject);
      uploadStream.on('finish', () => resolve());
      uploadStream.end(data);
    });
  }

  async download(key: string): Promise<Buffer> {
    const bucket = this.getBucket();
    return new Promise((resolve, reject) => {
      const downloadStream = bucket.openDownloadStreamByName(key);
      const chunks: Buffer[] = [];

      downloadStream.on('data', chunk => chunks.push(Buffer.from(chunk)));
      downloadStream.on('error', reject);
      downloadStream.on('end', () => resolve(Buffer.concat(chunks)));
    });
  }

  async delete(key: string): Promise<void> {
    const bucket = this.getBucket();
    const files = await bucket.find({ filename: key }).toArray();
    for (const file of files) {
      await bucket.delete(file._id);
    }
  }

  async exists(key: string): Promise<boolean> {
    const bucket = this.getBucket();
    const files = await bucket.find({ filename: key }).limit(1).toArray();
    return files.length > 0;
  }
}
