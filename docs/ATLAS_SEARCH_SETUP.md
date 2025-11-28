# MongoDB Atlas Search Setup Guide

This guide explains how to set up Atlas Search indexes for the Figure Collector backend search features (word wheel autocomplete and partial matching).

## Current Schema (v2.0.x)

The Figure model currently has these searchable fields:
- `name` - Figure name/title (e.g., "Hatsune Miku - Racing 2016")
- `manufacturer` - Manufacturer name (e.g., "Good Smile Company")
- `scale` - Scale (e.g., "1/8", "Non-scale")
- `userId` - User ownership (for filtering results)

**Note**: Fields like `series`, `artist`, `productLine`, `classification` will be added in v2.1.0 schema evolution.

## MFC Data Structure Reference

For future reference, MFC (MyFigureCollection.net) structures data as:

**Manager Export Format**:
```
[Original OR Series] - [Classification] - [Title] - [Scale] ([Manufacturers])
```

**Individual Page Fields**:
- Series (if applicable)
- Classification / Product Line
- Title
- Scale
- Manufacturer(s) - can be multiple
- Artist(s) - can be multiple, when available

**Example**:
```
Neon Genesis Evangelion - Figure - Rei Ayanami - Plugsuit Ver. - 1/8 (Kotobukiya)
```

These additional fields will be incorporated in v2.1.0.

---

## Prerequisites

1. MongoDB Atlas account with an M10+ cluster (Atlas Search not available on M0 free tier)
2. Admin access to your Atlas cluster
3. Backend deployed with `NODE_ENV=production`

---

## Option 1: Update Existing Index (Recommended)

If you already have a `figures_search` index, update it instead of recreating:

### Step 1: Navigate to Atlas Search

1. Log into [MongoDB Atlas](https://cloud.mongodb.com/)
2. Select your project and cluster
3. Click **"Search"** in the left sidebar (magnifying glass icon)
4. Find your existing `figures_search` index

### Step 2: Edit Index Configuration

1. Click the **"..."** menu next to your index
2. Select **"Edit Index"**
3. Click **"Edit with JSON"**
4. Replace the entire JSON with the contents of `docs/ATLAS_SEARCH_INDEX.json`
5. Click **"Save"** (or **"Next"** → **"Create Search Index"**)

### Step 3: Wait for Reindex

- Atlas will automatically reindex your collection
- This typically takes 1-5 minutes depending on collection size
- Status will show as "Building" then "Active"
- **No data loss** - existing data remains intact

---

## Option 2: Delete and Recreate Index

If you prefer a clean slate or encounter issues:

### Step 1: Delete Existing Index

1. Navigate to **"Search"** in Atlas
2. Find `figures_search` index
3. Click **"..."** menu → **"Delete Index"**
4. Confirm deletion

### Step 2: Create New Index

1. Click **"Create Search Index"**
2. Choose **"JSON Editor"**
3. Paste contents from `docs/ATLAS_SEARCH_INDEX.json`
4. Ensure:
   - **Database**: `your_database_name`
   - **Collection**: `figures`
   - **Index Name**: `figures_search`
5. Click **"Next"** → **"Create Search Index"**

### Step 3: Wait for Initial Index Build

- First-time indexing takes 1-10 minutes
- Monitor status in Atlas Search dashboard

---

## Option 3: Create Index via Atlas UI (Manual)

If you prefer clicking through the UI instead of JSON:

### Step 1: Start Index Creation

1. Navigate to **"Search"** → **"Create Search Index"**
2. Choose **"Visual Editor"**
3. Select database and `figures` collection
4. Name it `figures_search`

### Step 2: Configure Field Mappings

**Disable Dynamic Mapping**:
- Toggle **"Dynamic Mapping"** to OFF
- This ensures only specified fields are indexed

**Add `name` field**:
1. Click **"Add Field"**
2. Field name: `name`
3. Data type: **String**
4. Enable **"Enable Dynamic Mapping"** for this field: OFF
5. **Multi-analyzers**:
   - Add **Autocomplete** analyzer:
     - Analyzer: `lucene.whitespace`
     - Tokenization: `edgeGram`
     - Min Grams: 2
     - Max Grams: 15
     - Fold Diacritics: YES
   - Add **String** analyzer with name `ngram`:
     - Analyzer: `lucene.standard`
     - Search Analyzer: `lucene.keyword`

**Add `manufacturer` field**:
- Repeat same configuration as `name`

**Add `scale` field**:
1. Click **"Add Field"**
2. Field name: `scale`
3. Data type: **String**
4. Analyzer: `lucene.keyword` (exact match only)

**Add `userId` field**:
1. Click **"Add Field"**
2. Field name: `userId`
3. Data type: **ObjectId**

### Step 3: Create Index

- Click **"Create Search Index"**
- Wait for indexing to complete

---

## Verification

### Test the Index

```bash
# From backend directory
curl -H "Authorization: Bearer <your_jwt_token>" \
  "http://localhost:5000/api/search/suggestions?q=Miku&limit=5"
```

Expected response:
```json
{
  "success": true,
  "data": [
    {
      "_id": "...",
      "name": "Hatsune Miku",
      "manufacturer": "Good Smile Company",
      ...
    }
  ],
  "count": 1
}
```

### Check Index Status in Atlas

1. Navigate to **"Search"** in Atlas
2. Look for `figures_search` index
3. Status should be **"Active"**
4. Document count should match your `figures` collection

---

## Environment Configuration

Ensure your backend has these environment variables:

```bash
# Enable Atlas Search in production
NODE_ENV=production

# MongoDB connection (Atlas cluster)
MONGODB_URI=mongodb+srv://<username>:<password>@<cluster>.mongodb.net/<database>?retryWrites=true&w=majority

# For testing/development (uses regex fallback, no Atlas Search needed)
TEST_MODE=memory
```

**Development/Test Mode**:
- When `NODE_ENV` is not `production` OR `TEST_MODE=memory`
- Backend automatically uses regex-based search fallback
- No Atlas Search index required for development
- Allows testing without Atlas Search dependency

---

## Troubleshooting

### Index Shows "Building" for >10 Minutes

- Check Atlas cluster health
- Verify collection `figures` exists
- Check for very large collections (>1M documents)

### Search Returns No Results

1. **Verify index is "Active"** in Atlas
2. **Check collection has data**:
   ```javascript
   db.figures.countDocuments()
   ```
3. **Test with simple query**:
   ```bash
   curl "http://localhost:5000/api/search/suggestions?q=a&limit=5"
   ```
4. **Check environment variables**:
   ```bash
   echo $NODE_ENV  # Should be "production"
   echo $TEST_MODE # Should NOT be "memory"
   ```

### "Index not found" Error

- Index name must be exactly `figures_search`
- Check spelling and case-sensitivity
- Verify index is on correct database and collection

### Slow Query Performance

- Atlas Search requires M10+ cluster (not M0 free tier)
- Consider upgrading cluster for better performance
- Check index covers all searched fields

---

## Future Migrations (v2.1.0)

When we add new fields in v2.1.0 schema evolution, you'll need to update the index:

### Planned New Fields

```json
{
  "series": "string",           // MFC series name
  "classification": "string",   // Figure type (e.g., "Scale Figure")
  "productLine": "string",      // Product line (e.g., "1/8 Complete Figure")
  "artist": ["string"],         // Sculptor/artist names (array)
  "title": "string",            // Original Japanese title
  "releaseDate": "date",        // Official release date
  "price": "number",            // MSRP in yen
  "jan": "string",              // JAN/EAN barcode
  "manufacturers": ["string"]   // Multiple manufacturers (array)
}
```

### Migration Steps for v2.1.0

1. **Backend deploys new schema** (backward compatible - old data still works)
2. **Update Atlas Search index**:
   - Edit existing `figures_search` index
   - Add new fields to mappings (see v2.1.0 migration guide)
   - Atlas reindexes automatically
3. **No data migration needed** - new fields are optional
4. **Bulk import MFC data** via CSV (populates new fields)

**Migration script will be provided in v2.1.0 release**.

---

## Index Configuration Reference

### Current Configuration (v2.0.x)

```json
{
  "mappings": {
    "dynamic": false,
    "fields": {
      "name": [
        {
          "type": "string",
          "analyzer": "lucene.standard"
        },
        {
          "type": "autocomplete",
          "tokenization": "edgeGram",
          "minGrams": 2,
          "maxGrams": 15
        }
      ],
      "manufacturer": [
        {
          "type": "string",
          "analyzer": "lucene.standard"
        },
        {
          "type": "autocomplete",
          "tokenization": "edgeGram",
          "minGrams": 2,
          "maxGrams": 15
        }
      ],
      "scale": {
        "type": "string",
        "analyzer": "lucene.keyword"
      },
      "userId": {
        "type": "objectId"
      }
    }
  }
}
```

**Key Features**:
- **Autocomplete**: Edge n-gram (2-15 chars) for word-wheel search
- **Text Search**: Standard analyzer for partial word matching
- **User Isolation**: `userId` filter ensures users only see their figures
- **Dynamic Mapping OFF**: Only specified fields are indexed (saves resources)
- **Array-based field definitions**: Each field can have multiple analyzers applied automatically

---

## Performance Expectations

- **Word Wheel Search**: <200ms for typical queries
- **Partial Match Search**: <300ms for typical queries
- **Concurrent Users**: Handles 100+ concurrent searches on M10 cluster
- **Index Size**: ~1-2 MB per 1000 documents

---

## Support

If you encounter issues:

1. Check Atlas cluster health dashboard
2. Verify index status in Atlas Search UI
3. Test with regex fallback (set `TEST_MODE=memory`)
4. Review backend logs for detailed error messages

---

## No Migration Needed for Current Release

**Important**: This release (v2.0.x) works with existing data.

- ✅ Existing `figures` collection data is compatible
- ✅ No schema changes to existing fields
- ✅ No data migration scripts required
- ✅ Index update is non-destructive (data remains intact)

**Only action required**: Update/create Atlas Search index as described above.
