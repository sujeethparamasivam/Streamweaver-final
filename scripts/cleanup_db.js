const mongoose = require('mongoose');
const dotenv = require('dotenv');

dotenv.config();

const MONGO_URI = process.env.MONGO_URI;

const cleanupDatabase = async () => {
  try {
    console.log(`Attempting to connect to: ${MONGO_URI}`);
    await mongoose.connect(MONGO_URI, { 
      serverSelectionTimeoutMS: 5000,
      connectTimeoutMS: 5000
    });
    console.log('Connected to MongoDB');

    const db = mongoose.connection.db;

    // Get all collections
    const collections = await db.listCollections().toArray();
    console.log(`\nFound ${collections.length} collections`);

    for (const collection of collections) {
      const col = db.collection(collection.name);
      const count = await col.countDocuments();
      const stats = await db.command({ collStats: collection.name });
      const sizeInMB = (stats.size / (1024 * 1024)).toFixed(2);
      
      console.log(`\n${collection.name}:`);
      console.log(`  Documents: ${count}`);
      console.log(`  Size: ${sizeInMB} MB`);
    }

    // Delete all UploadRow, MemorySample, ValidationRecord documents to free space
    console.log('\n\n=== DELETING OLD DATA ===\n');

    const uploadRowResult = await db.collection('uploadrows').deleteMany({});
    console.log(`Deleted ${uploadRowResult.deletedCount} uploadrow documents`);

    const memorySampleResult = await db.collection('memorysamples').deleteMany({});
    console.log(`Deleted ${memorySampleResult.deletedCount} memorysample documents`);

    const validationRecordResult = await db.collection('validationrecords').deleteMany({});
    console.log(`Deleted ${validationRecordResult.deletedCount} validationrecord documents`);

    const importJobResult = await db.collection('importjobs').deleteMany({});
    console.log(`Deleted ${importJobResult.deletedCount} importjob documents`);

    // Show updated space usage
    console.log('\n\n=== UPDATED SPACE USAGE ===\n');
    const updatedCollections = await db.listCollections().toArray();
    
    for (const collection of updatedCollections) {
      const col = db.collection(collection.name);
      const count = await col.countDocuments();
      const stats = await db.command({ collStats: collection.name });
      const sizeInMB = (stats.size / (1024 * 1024)).toFixed(2);
      
      console.log(`${collection.name}: ${count} docs, ${sizeInMB} MB`);
    }

    await mongoose.connection.close();
    console.log('\nCleanup complete! MongoDB connection closed.');
    process.exit(0);
  } catch (error) {
    console.error('Cleanup error:', error);
    process.exit(1);
  }
};

cleanupDatabase();
