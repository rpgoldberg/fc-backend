# Schema v3.0 Index & Atlas Deployment Guide

This guide documents the database indexes for the new models introduced in Schema v3.0 (Issue #68 - MFC Bulk Import & Schema Evolution), their local vs. Atlas behavior, and deployment procedures.

## Index Categories

### 1. Standard MongoDB Indexes (Work Everywhere)

These indexes are defined in Mongoose schemas and auto-created by MongoDB:

| Model | Index | Type | Purpose |
|-------|-------|------|---------|
| **RoleType** | `{name: 1, kind: 1}` | Compound Unique | Prevent duplicate role names per kind |
| **RoleType** | `{kind: 1}` | Single | Filter roles by kind |
| **Company** | `{name: 1, category: 1, subType: 1}` | Compound Unique | Allow same company in different roles |
| **Company** | `{name: 'text'}` | Text | Full-text search (basic) |
| **Company** | `{mfcId: 1}` | Sparse | Lookup by MFC ID |
| **Artist** | `{name: 1}` | Unique | Prevent duplicate artists |
| **Artist** | `{name: 'text'}` | Text | Full-text search |
| **Artist** | `{mfcId: 1}` | Sparse Unique | Lookup by MFC ID |
| **MFCItem** | `{mfcId: 1}` | Unique | Primary lookup |
| **MFCItem** | `{name: 1}` | Single | Name queries |
| **MFCItem** | `{scale: 1}` | Single | Scale filter |
| **MFCItem** | `{tags: 1}` | Single | Tag filter |
| **MFCItem** | `{name: 'text', tags: 'text'}` | Text | Full-text search |
| **UserFigure** | `{userId: 1, mfcItemId: 1}` | Compound Unique | One entry per user-item |
| **UserFigure** | `{userId: 1, collectionStatus: 1}` | Compound | Collection by status |
| **UserFigure** | `{userId: 1, rating: -1}` | Compound | Sort by rating |
| **UserFigure** | `{customTags: 1}` | Single | Custom tag filter |
| **SearchIndex** | `{entityType: 1, entityId: 1}` | Compound Unique | One entry per entity |
| **SearchIndex** | `{entityType: 1, popularity: -1}` | Compound | Popular items by type |
| **SearchIndex** | `{tags: 1, popularity: -1}` | Compound | Popular by tag |
| **SearchIndex** | `{mfcId: 1}` | Sparse | MFC lookup |
| **SearchIndex** | `{searchText: 'text', nameSearchable: 'text', tags: 'text'}` | Text | Full-text search |

**These indexes work identically on:**
- MongoDB Memory Server (tests)
- Local MongoDB (development)
- MongoDB Atlas (production)

### 2. MongoDB Atlas Search Indexes (Atlas Only)

Atlas Search indexes use the `$search` aggregation operator and require manual creation in Atlas. They **cannot** be tested against local MongoDB.

| Collection | Index Name | Fields | Purpose |
|------------|------------|--------|---------|
| **searchindexes** | `unified_search` | searchText, nameSearchable, tags | Unified cross-entity search |
| **mfcitems** | `mfcitems_search` | name, tags, scale | Figure catalog search |

---

## Local Development & Testing Behavior

### What Works Locally

| Feature | Local/Memory | Mechanism |
|---------|--------------|-----------|
| All CRUD operations | ✅ Works | Mongoose |
| Standard indexes | ✅ Works | Auto-created |
| Text indexes (`{field: 'text'}`) | ✅ Works | `$text` operator |
| Compound/unique indexes | ✅ Works | Auto-enforced |
| Regular `find()` queries | ✅ Works | Standard MongoDB |
| Regex search fallback | ✅ Works | `$regex` operator |

### What Requires Atlas

| Feature | Local/Memory | Reason |
|---------|--------------|--------|
| `$search` operator | ❌ Fails | Atlas Search only |
| Autocomplete analyzer | ❌ Fails | Atlas Search only |
| Fuzzy matching (Atlas) | ❌ Fails | Atlas Search only |
| EdgeGram tokenization | ❌ Fails | Atlas Search only |

### Fallback Strategy

The search service automatically falls back to regex-based search when Atlas Search is not available.

**Current logic (to be improved):**
- `NODE_ENV !== 'production'` → fallback
- `TEST_MODE === 'memory'` → fallback
- `INTEGRATION_TEST` is set → fallback
- Atlas Search throws an error → fallback

**Recommended improvement - use explicit `ENABLE_ATLAS_SEARCH` flag:**

```bash
# Environment variables for Atlas-connected environments
ENABLE_ATLAS_SEARCH=true   # Set on any env with Atlas Search indexes
TEST_MODE=memory           # Only for local tests (overrides ENABLE_ATLAS_SEARCH)
```

**Pattern to follow for new SearchIndex queries:**

```typescript
// IMPROVED: Use explicit flag instead of NODE_ENV
const useAtlasSearch = process.env.ENABLE_ATLAS_SEARCH === 'true' &&
                      process.env.TEST_MODE !== 'memory' &&
                      !process.env.INTEGRATION_TEST;

if (!useAtlasSearch) {
  // Fallback: regex or $text search
  return SearchIndex.find({
    $text: { $search: query },
    entityType: type
  }).limit(limit);
}

// Atlas Search with $search operator
return SearchIndex.aggregate([
  { $search: { index: 'unified_search', text: { query, path: 'searchText' } } },
  { $match: { entityType: type } },
  { $limit: limit }
]);
```

---

## Atlas Deployment Procedure

### Phase 1: Mongoose Index Sync (Automatic)

Standard indexes defined in schemas are auto-created when:
1. Application connects to MongoDB Atlas
2. `autoIndex: true` is enabled (default in development)
3. Or manually via: `await mongoose.connection.syncIndexes()`

**Verification:**
```javascript
// Check indexes on a collection
db.searchindexes.getIndexes()
db.mfcitems.getIndexes()
db.userfigures.getIndexes()
```

### Phase 1.5: System Data Seeding (Automatic)

`seedRoleTypes()` runs **automatically** on every app startup when:
- `NODE_ENV !== 'test'`
- `TEST_MODE !== 'memory'`

This means the RoleType collection is populated with system roles (Manufacturer, Sculptor, etc.) without any manual intervention. The seeding is idempotent - existing roles are preserved and only missing ones are added.

**No action required** - seeding happens automatically when deploying to any environment.

### Phase 2: Atlas Search Index Creation (Manual)

Atlas Search indexes must be created via Atlas UI or API.

#### Option A: Atlas UI

1. Log into [MongoDB Atlas](https://cloud.mongodb.com/)
2. Navigate to your cluster → **Search** tab
3. Click **Create Search Index**
4. Choose **JSON Editor**
5. Use the configurations below

#### Option B: MongoDB Atlas CLI

```bash
# Install Atlas CLI
brew install mongodb-atlas

# Create search index
atlas clusters search indexes create \
  --clusterName YOUR_CLUSTER \
  --file docs/atlas-search-indexes/unified_search.json
```

### Atlas Search Index Configurations

#### SearchIndex Collection: `unified_search`

**File: `docs/atlas-search-indexes/unified_search.json`**
```json
{
  "name": "unified_search",
  "database": "YOUR_DATABASE",
  "collectionName": "searchindexes",
  "mappings": {
    "dynamic": false,
    "fields": {
      "searchText": [
        { "type": "string", "analyzer": "lucene.standard" },
        { "type": "autocomplete", "tokenization": "edgeGram", "minGrams": 2, "maxGrams": 15 }
      ],
      "nameSearchable": [
        { "type": "string", "analyzer": "lucene.standard" }
      ],
      "tags": [
        { "type": "string", "analyzer": "lucene.keyword" }
      ],
      "entityType": {
        "type": "string",
        "analyzer": "lucene.keyword"
      },
      "popularity": {
        "type": "number"
      }
    }
  }
}
```

#### MFCItem Collection: `mfcitems_search`

**File: `docs/atlas-search-indexes/mfcitems_search.json`**
```json
{
  "name": "mfcitems_search",
  "database": "YOUR_DATABASE",
  "collectionName": "mfcitems",
  "mappings": {
    "dynamic": false,
    "fields": {
      "name": [
        { "type": "string", "analyzer": "lucene.standard" },
        { "type": "autocomplete", "tokenization": "edgeGram", "minGrams": 2, "maxGrams": 15 }
      ],
      "tags": [
        { "type": "string", "analyzer": "lucene.keyword" }
      ],
      "scale": {
        "type": "string",
        "analyzer": "lucene.keyword"
      },
      "mfcId": {
        "type": "number"
      }
    }
  }
}
```

---

## Testing Strategy for New Models

### Unit/Integration Tests (Memory Mode)

All tests use MongoDB Memory Server by default:
```bash
npm test                    # Uses TEST_MODE=memory
npm run test:memory         # Explicit memory mode
```

**What's tested:**
- Model validation
- Index constraints (unique, compound)
- CRUD operations
- Relationships and population
- Text search with `$text` operator

**What's NOT tested:**
- Atlas `$search` operator (mocked or skipped)
- Autocomplete behavior
- Fuzzy matching

### Atlas Mode Tests (Optional)

For testing real Atlas Search behavior:
```bash
export TEST_MODE=atlas
export ATLAS_TEST_URI="mongodb+srv://..."
npm run test:atlas
```

### Mock Implementation for SearchIndex

The existing Atlas Search mock pattern should be extended for SearchIndex:

```typescript
// tests/mocks/atlasSearchMock.ts
export const mockSearchIndexSearch = (query: string, docs: ISearchIndex[]) => {
  const normalizedQuery = query.toLowerCase();
  return docs.filter(doc =>
    doc.searchText.toLowerCase().includes(normalizedQuery) ||
    doc.nameSearchable.includes(normalizedQuery) ||
    doc.tags?.some(tag => tag.toLowerCase().includes(normalizedQuery))
  );
};
```

---

## Deployment Checklist

### Before Deploying v3.0

- [x] **Standard Indexes**: Will auto-create on first connection
- [x] **System Data Seeding**: Runs automatically on startup (no action needed)
- [ ] **Environment Variable**: Add `ENABLE_ATLAS_SEARCH=true` if Atlas Search indexes are configured
- [ ] **Atlas Search Indexes**: Create manually via Atlas UI or CLI
  - [ ] `unified_search` on `searchindexes` collection
  - [ ] `mfcitems_search` on `mfcitems` collection
- [ ] **Verify Indexes**: Check all collections have expected indexes
- [ ] **Test Fallback**: Verify regex fallback works if Atlas Search unavailable

### Post-Deployment Verification

```bash
# Check search index status in Atlas UI
# Status should show "Active" for all search indexes

# Test unified search endpoint
curl -H "Authorization: Bearer <token>" \
  "https://api.example.com/api/search?q=saber&type=figure"

# Verify fallback works by temporarily disabling Atlas Search
TEST_MODE=memory npm run test:search
```

---

## Known Limitations

### MongoDB 3-Index Limit on Atlas Search

MongoDB Atlas has a 3 search index limit per cluster (on lower tiers). The SearchIndex collection is designed to work around this by consolidating entities:

- **1 index** for `searchindexes` (covers figures, companies, artists)
- **1 index** for `mfcitems` (catalog search)
- **1 index** reserved for `figures` (legacy/existing)

### Text Index Limitations

MongoDB allows only ONE text index per collection. The schemas are designed with this in mind:
- `SearchIndex` has: `{searchText, nameSearchable, tags}` combined
- `MFCItem` has: `{name, tags}` combined
- This is separate from Atlas Search which has no such limit

---

## Migration from v2.x

### No Data Migration Required

Schema v3.0 introduces **new collections** that coexist with existing ones:
- `roletypes` - New
- `companies` - New
- `artists` - New
- `mfcitems` - New
- `userfigures` - New
- `searchindexes` - New
- `figures` - **Existing** (unchanged)

### Index Migration Path

1. Deploy new code (creates new collections on first access)
2. Create Atlas Search indexes via UI
3. Run `seedRoleTypes()` to populate system roles
4. Populate `SearchIndex` collection via sync service (Phase 4)

---

## Support

If you encounter issues:
1. Verify environment variables (`TEST_MODE`, `NODE_ENV`)
2. Check Atlas Search index status (should be "Active")
3. Review backend logs for fallback activation
4. Test with explicit regex mode: `TEST_MODE=memory`
