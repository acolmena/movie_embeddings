const { MongoClient } = require('mongodb');
require('dotenv').config();
const uri = process.env.MONGODB_CONNECTION_STRING