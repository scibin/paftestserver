// This file is to help assign the environment variables
// to the config parameters required for MySQL / S3 / mongodb
// if the config.js file is not available

// This filed will be able to be checked in into git because it
// does not contain any keys/passwords

// Load libraries required
const fs = require('fs');
const path = require('path');
const { sqldbName, sqlConnLimit } = require('./dbinfo');

// Path of config file used during development
const configPath = path.join(__dirname, 'config.js');

// MySQL
let mysql;
// S3 AWS config
let s3;
// mongodb config
let mongodb;
// Google API Key
let google;

// If config file used during development exists, use it 
// If not, get config keys from env variables
if (fs.existsSync(configPath)) {
    const config = require('./config');
    mysql = config.mysql;
    mysql.ssl = {
        ca: fs.readFileSync(mysql.cacert)
    };
    s3 = config.s3;
    mongodb = config.mongodb.url;
} else {
    mysql = {
        host: process.env.DB_HOST,
        port: process.env.DB_PORT,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: sqldbName,
        connectionLimit: sqlConnLimit,
        ssl: {
            ca: process.env.DB_CA
        }
    };
    s3 = {
        accessKeyId: process.env.S3_ACCESS_KEY,
        secretAccessKey: process.env.S3_SECRET_KEY
    };
    mongodb = process.env.MONGODB_URL;
}

module.exports = { mysql, s3, mongodb, google };
