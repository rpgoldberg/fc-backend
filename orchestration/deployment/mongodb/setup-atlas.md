# MongoDB Atlas Setup Guide

This guide explains how to set up MongoDB Atlas for the Figure Collector application.

## 1. Create MongoDB Atlas Account

1. Sign up at [MongoDB Atlas](https://www.mongodb.com/cloud/atlas/register)
2. Create a new organization and project

## 2. Create a Cluster

1. Create a new cluster (choose the free tier for development)
2. Select your preferred cloud provider (Google Cloud recommended)
3. Select a region closest to your users
4. Choose the M0 Sandbox tier (Free)
5. Give your cluster a name (e.g., `figure-collector`)

## 3. Configure Database Access

1. Go to "Database Access" under the Security section
2. Click "Add New Database User"
3. Create a user with password authentication
   - Username: Choose a secure username
   - Password: Generate a strong password
   - Role: "Read and Write to Any Database"
4. Click "Add User"

## 4. Configure Network Access

1. Go to "Network Access" under the Security section
2. Click "Add IP Address"
3. For development, you can add `0.0.0.0/0` to allow access from anywhere
4. For production, add the specific IP addresses of your servers

## 5. Get Connection String

1. Go to your cluster and click "Connect"
2. Choose "Connect your application"
3. Copy the connection string
4. Replace `<password>` with your database user's password
5. Securely store this connection string in your environment variables

## 6. Create Search Index

1. Go to your cluster and click "Search" tab
2. Click "Create Search Index"
3. Choose JSON Editor and paste the following configuration:

{
  "mappings": {
    "dynamic": false,
    "fields": {
      "manufacturer": {
        "type": "string",
        "analyzer": "lucene.standard"
      },
      "name": {
        "type": "string",
        "analyzer": "lucene.standard"
      },
      "scale": {
        "type": "string"
      },
      "location": {
        "type": "string",
        "analyzer": "lucene.standard"
      },
      "boxNumber": {
        "type": "string"
      },
      "userId": {
        "type": "string"
      }
    }
  }
}

4. Name the index "figures" and click "Create"

## 7. Create Initial Data

To use MongoDB Atlas Search, you need to have at least one document in your collection. 
Add a sample document using MongoDB Compass or the MongoDB Atlas UI:

1. Connect to your cluster
2. Create a database called `figure-collector`
3. Create a collection called `figures`
4. Add a sample document:

{
  "manufacturer": "Good Smile Company",
  "name": "Nendoroid Hatsune Miku",
  "scale": "Nendoroid",
  "mfcLink": "https://myfigurecollection.net/item/972621",
  "location": "Display Case A",
  "boxNumber": "B001",
  "imageUrl": "https://static.myfigurecollection.net/upload/pictures/2020/10/07/2543343.jpeg",
  "userId": "sampleuser123"
}

## 8. Security Best Practices

1. Use IP Allowlisting for production deployments
2. Create a dedicated database user with minimal privileges
3. Regularly rotate your database user passwords
4. Enable MongoDB Atlas Advanced Security features for production
