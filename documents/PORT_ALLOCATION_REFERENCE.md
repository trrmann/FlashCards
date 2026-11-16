# Port Allocation Reference

## Master Reference

The authoritative port allocation and rollout sequence is maintained in the iam-service project:

📍 `/home/tmann/Documents/Projects/iam-service/documents/PORT_ALLOCATION.md`

This file contains:
- Complete cross-project port allocation for all 7 services
- Phase rollout sequence and status
- Coordination requirements and gates
- Production smoke check procedures

## FlashCards Role (Phase 4)

**Status:** ✅ **COMPLETE**

### Ports Adopted

| Environment | Port | Coordinated With         |
| ----------- | ---- | ------------------------ |
| Development | 2010 | Slot 10 (10 = 2010 / 5010 / 8010) |
| Preview     | 5010 | IAM service (phase 3) on 2030/5030 |
| Production  | 8010 | (Requires Render `PORT=8010`) |

### Integration

- **IAM Service:** FlashCards connects to IAM service on coordinated ports (2030/5030/8030)
- **Local Dev:** Set `IAM_URL=http://localhost:2030` in `.env` for cross-service communication
- **Testing:** Tests use isolated ports (5089, 5091, etc.) for parallel execution

### Implementation Status

- ✅ Port allocation configured in `.env` (PORT_DEV=2010, PORT_PREVIEW=5010)
- ✅ Server default updated to 2010 (src/scripts/js/modules/server.mjs)
- ✅ IAM integration via IAM_URL env variable
- ✅ Documentation updated (PORT_CONFIGURATION.md)
- ✅ All existing tests pass with isolated ports
- ✅ Git commit created: Phase 4 port adoption

### Local Development Setup

```bash
# Terminal 1: IAM service (must start first)
cd ~/Documents/Projects/iam-service
npm run dev
# Runs on http://localhost:2030

# Terminal 2: FlashCards (automatically connects to IAM)
cd ~/Documents/Projects/FlashCards
npm run dev
# Runs on http://localhost:2010
# Uses IAM_URL=http://localhost:2030 from .env
```

### Next Phase

Phase 5: Heros service (ports 2000/5000/8000)

---

**Last Updated:** 2026-11-16  
**Maintained by:** Cross-project port allocation gate
