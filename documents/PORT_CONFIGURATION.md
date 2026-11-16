# Port Configuration Guide (Phase 4: Coordinated Allocation)

## Overview

The FlashCards application uses **coordinated port allocation** across a cross-project gate of seven services. All services adopt specific ports in sequence to enable seamless integration and testing. This document describes FlashCards' role in Phase 4 of the port adoption rollout.

**Reference:** See `/home/tmann/Documents/Projects/iam-service/documents/PORT_ALLOCATION.md` for the complete cross-project allocation and rollout sequence.

## Coordinated Port Allocations

### Development (NODE_ENV=development)

| Service         | Slot | Dev Port | Preview Port | Prod Port | Status    |
| --------------- | ---- | -------- | ------------ | --------- | --------- |
| Heros           | 00   | 2000     | 5000         | 8000      | Pending   |
| **FlashCards**  | **10** | **2010** | **5010**     | **8010**  | **Phase 4** ✅ |
| Wurm web       | 20   | 2020     | 5020         | 8020      | Pending   |
| IAM service    | 30   | 2030     | 5030         | 8030      | Phase 3 ✅ |
| Wurm helper    | 40   | 2040     | 5040         | 8040      | Pending   |
| request-queue  | 50   | 2050     | 5050         | 8050      | Library   |
| platform-db    | 60   | 2060     | 5060         | 8060      | Library   |

## Configuration

### Local Development (.env)

```env
# Coordinated port allocation (documents/PORT_ALLOCATION.md, Phase 4)
PORT_DEV=2010
PORT_PREVIEW=5010
NODE_ENV=development

# IAM service integration (Phase 3: coordinated ports)
# Local development: points to IAM running on coordinated port 2030
# Comment out or set to empty string for in-process IAM (default)
IAM_URL=http://localhost:2030
```

### Production (Render Environment Variables)

**Update Required:** Set `PORT=8010` in Render environment.

The application code handles this via backward compatibility:

- When `NODE_ENV=production`, it looks for `PORT_PROD` first (8010)
- Falls back to `PORT` environment variable (Render's PORT)
- Final fallback to hardcoded default (8010)

## How It Works

### Port Selection Logic (`Server.resolvePort` in src/scripts/js/modules/server.mjs)

```javascript
const portMap = {
  development: process.env.PORT_DEV || 2010,  // Uses .env PORT_DEV (coordinated)
  preview: process.env.PORT_PREVIEW || 5010,  // Uses .env PORT_PREVIEW (coordinated)
  production: process.env.PORT_PROD || process.env.PORT || 8010,  // Backward compatible
};
const port = portMap[NODE_ENV] || 2010;  // DEFAULT_PORT is now 2010
```

### Environment Detection

| Scenario          | NODE_ENV      | Port Used | Source                   | Integration                |
| ----------------- | ------------- | --------- | ------------------------ | -------------------------- |
| Local dev         | `development` | 2010      | `.env PORT_DEV`          | iam-service on 2030        |
| Local preview     | `preview`     | 5010      | `.env PORT_PREVIEW`      | iam-service on 5030        |
| Render prod       | `production`  | 8010      | Render's `PORT` variable | iam-service on 8030        |
| Fallback          | (any)         | 2010      | Hardcoded default        | In-process IAM or env var  |

## IAM Integration

FlashCards integrates with IAM service (Phase 3) via coordinated ports:

```env
# In .env, to enable remote IAM:
IAM_URL=http://localhost:2030

# To use in-process IAM (default, no env var):
# Leave IAM_URL unset or empty
```

**Test Strategy:**
- Tests use isolated IAM ports (5089, 5091, 5092, etc.) for parallel execution
- Integration tests that require cross-service communication use coordinated ports
- `npm test` runs with in-process IAM (default)
- `npm run test:iam:remote` runs with remote IAM on coordinated port 2030

## Deployment Examples

### Running Development with IAM

```bash
# Terminal 1: IAM service (must start first)
cd ~/Documents/Projects/iam-service
npm run dev
# IAM runs on http://localhost:2030

# Terminal 2: FlashCards (waits for IAM health check)
cd ~/Documents/Projects/FlashCards
npm run dev
# FlashCards runs on http://localhost:2010
# Communicates with IAM on http://localhost:2030
```

### Testing Cross-Service Communication

```bash
# Terminal 1: IAM service on coordinated dev port
cd ~/Documents/Projects/iam-service
npm run dev

# Terminal 2: FlashCards on coordinated dev port with remote IAM
cd ~/Documents/Projects/FlashCards
IAM_URL=http://localhost:2030 npm run dev
```

### Production on Render

Render will automatically set `NODE_ENV=production` and use:
- FlashCards on port 8010
- IAM service on port 8030
- Both services communicate via their public Render URLs

## Backward Compatibility

✅ **Render deployment is unaffected by port defaults**

The production code maintains backward compatibility:

```javascript
production: process.env.PORT_PROD || process.env.PORT || 8010;
```

This ensures:
- ✅ If Render only has `PORT=3000` → App uses 3000 (old config)
- ✅ If Render has `PORT=8010` → App uses 8010 (new coordinated)
- ✅ If Render has `PORT_PROD=8010` → App uses 8010 (explicit preference)
- ✅ If Render has neither → App defaults to 8010 (new default)

**Action Required:** Update Render environment to `PORT=8010` for Phase 4+.

## Cross-Project Gate Status

### Completed Phases

- ✅ **Phase 1:** platform-db library (no ports)
- ✅ **Phase 2:** request-queue library (no ports)
- ✅ **Phase 3:** IAM service adoption (ports 2030/5030/8030)
- ✅ **Phase 4:** FlashCards adoption (ports 2010/5010/8010) ← **THIS PHASE**

### Upcoming Phases

- ⏳ **Phase 5:** Heros service (ports 2000/5000/8000)
- ⏳ **Phase 6:** Wurm web service (ports 2020/5020/8020)
- ⏳ **Phase 7:** Wurm helper service (ports 2040/5040/8040)

## Testing

Verify each environment is using the correct port and connecting to IAM:

```bash
# Development (should connect to IAM on 2030)
curl http://localhost:2010/api/health

# Preview (should connect to IAM on 5030)
curl http://localhost:5010/api/health

# Check IAM reachability
curl http://localhost:2030/api/health
```

All should return 200 with health status.

## FAQ

### Q: Do I need to update Render?

**A:** Yes, for Phase 4+. Set `PORT=8010` in Render environment. The backward compatibility fallback ensures `PORT=3000` still works for older deployments, but coordinated allocation requires `PORT=8010`.

### Q: Can I run FlashCards and IAM together locally?

**A:** Yes! Start IAM first (runs on 2030), then FlashCards with `IAM_URL=http://localhost:2030`. FlashCards runs on 2010.

### Q: Why do tests use different ports (5089, 5091, etc.)?

**A:** Tests use isolated test ports for parallel execution without conflicts. This allows multiple test suites to run simultaneously on the same machine.

### Q: What if I want to use a different port for local development?

**A:** Override when running:

```bash
PORT_DEV=2111 npm run dev
```

However, coordinated allocation requires 2010 for integration with other services.

### Q: Is in-process IAM still supported?

**A:** Yes! If `IAM_URL` is not set, FlashCards uses the in-process IAM (LocalIdentityGateway). This is the default for `npm test`.

---

**Last Updated:** 2026-11-16  
**Phase 4 Status:** ✅ Coordinated port adoption complete  
**Next Phase:** Phase 5 (Heros service)
