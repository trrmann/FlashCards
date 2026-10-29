# Port Configuration Guide

## Overview

The FlashCards application uses **environment-specific ports** to allow running dev, preview, and production environments simultaneously on your local machine without port conflicts.

## Port Assignments

| Environment | Port | Command | Use Case |
|---|---|---|---|
| **Development** | 5000 | `deploy -dev` | Local development with live reload |
| **Preview** | 4000 | `deploy -preview` | Testing before production with strict checks |
| **Production** | 3000 | `deploy -prod` | Render cloud deployment |

## Configuration

### Local Development (.env)

```env
PORT_DEV=5000
PORT_PREVIEW=4000
PORT_PROD=3000
NODE_ENV=development
```

All three port variables are defined locally so you can understand the full configuration.

### Production (Render Environment Variables)

**No changes needed!** ✅

Render already has:
```
NODE_ENV=production
PORT=3000
```

The application code automatically handles this:
- When `NODE_ENV=production`, it looks for `PORT_PROD` first
- If `PORT_PROD` is not set (which it isn't in Render), it falls back to `PORT`
- This ensures Render's existing `PORT=3000` variable continues to work

## How It Works

### Port Selection Logic (server.js)

```javascript
const portMap = {
  development: process.env.PORT_DEV || 5000,      // Uses .env PORT_DEV
  preview: process.env.PORT_PREVIEW || 4000,      // Uses .env PORT_PREVIEW
  production: process.env.PORT_PROD || process.env.PORT || 3000,  // Backward compatible
};
const port = portMap[NODE_ENV] || 3000;
```

### Environment Detection

| Scenario | NODE_ENV | PORT Used | Source |
|---|---|---|---|
| Local dev | `development` | 5000 | `.env PORT_DEV` |
| Local preview | `preview` | 4000 | `.env PORT_PREVIEW` |
| Render prod | `production` | 3000 | Render's `PORT` variable |
| Fallback | (any) | 3000 | Hardcoded default |

## Deployment Examples

### Running All Three Locally

```bash
# Terminal 1: Development (port 5000)
cd ~/Documents/Projects/FlashCards
bash deploy.sh -dev
# App runs on http://localhost:5000

# Terminal 2: Preview (port 4000)
cd ~/Documents/Projects/FlashCards
bash deploy.sh -preview
# App runs on http://localhost:4000

# Terminal 3: Testing Render behavior (port 3000)
NODE_ENV=production npm run dev
# App runs on http://localhost:3000
```

### Switching Between Environments

```bash
# Stop the current environment (Ctrl+C in the terminal)

# Deploy different environment
bash deploy.sh -preview
```

The deploy script automatically:
1. Kills any process on the old port
2. Sets the correct `NODE_ENV`
3. Starts the server on the new port

## Backward Compatibility

✅ **Render deployment is unaffected**

The production code maintains backward compatibility:

```javascript
// Works with Render's existing PORT variable
production: process.env.PORT_PROD || process.env.PORT || 3000
```

This means:
- ✅ If Render only has `PORT=3000` → App uses 3000
- ✅ If Render adds `PORT_PROD=3000` → App uses 3000
- ✅ If Render removes both → App defaults to 3000

**No Render environment variable changes required!**

## Port Conflicts

If a port is already in use:

```
[WARN] Process already running on port 5000. Killing...
```

The deploy script automatically kills the old process and starts the new one.

If you want to run multiple instances:

```bash
# Change the port for this run
PORT_DEV=5001 bash deploy.sh -dev
```

## Testing

Verify each environment is using the correct port:

```bash
# Development
curl http://localhost:5000/api/health

# Preview
curl http://localhost:4000/api/health

# Production
curl http://localhost:3000/api/health
```

All should return:
```json
{
  "status": "healthy",
  "database": "shared_apps_wuy4"
}
```

## Environment Variables Summary

### What Changed

| Variable | Before | After | Reason |
|---|---|---|---|
| `.env PORT` | Hardcoded 5000 | Removed | Replaced with PORT_DEV |
| `.env PORT_DEV` | N/A | Added | Development environment |
| `.env PORT_PREVIEW` | N/A | Added | Preview environment |
| `.env PORT_PROD` | N/A | Added | Production reference |
| Render `PORT` | 3000 | Unchanged | Works with backward compatibility |

### Environment Variables Table

| Variable | Local Dev | Render Prod | Required | Notes |
|---|---|---|---|---|
| `PORT_DEV` | ✅ 5000 | ❌ | No | Local dev only |
| `PORT_PREVIEW` | ✅ 4000 | ❌ | No | Local preview only |
| `PORT_PROD` | ✅ 3000 | ❌ | No | Optional, reference only |
| `PORT` | ❌ | ✅ 3000 | Yes (Render) | Set in Render dashboard |
| `NODE_ENV` | development | production | Yes | Controls port selection |

## FAQ

### Q: Do I need to update Render?
**A:** No! The backward compatibility fallback ensures Render's existing `PORT=3000` continues to work.

### Q: Can I run all three environments at once?
**A:** Yes! Each environment uses a different port:
- Dev on 5000
- Preview on 4000
- Prod on 3000

You can run them in separate terminal windows simultaneously.

### Q: What if a port is already in use?
**A:** The deploy script automatically kills the old process on that port before starting the new one.

### Q: Can I use different ports?
**A:** Yes! Override when deploying:
```bash
PORT_DEV=8000 bash deploy.sh -dev
```

### Q: Why these specific ports?
**A:**
- 5000: Standard Node.js development port
- 4000: Common preview/staging port
- 3000: Render's configured production port

## Future Enhancement: Render Port_PROD

If you later want to use `PORT_PROD` in Render instead of the generic `PORT`:

1. Go to Render dashboard
2. Add: `PORT_PROD=3000`
3. No code changes needed (backward compatible)
4. Optionally remove `PORT` (not required)

The application will automatically prefer `PORT_PROD` over `PORT`.

---

**Last Updated:** 2026-10-29  
**Status:** ✅ Implemented and Tested  
**Breaking Changes:** None (fully backward compatible)
