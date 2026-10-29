# Testing Strategy for FlashCards

## Testing Philosophy

- **Comprehensive**: Unit, integration, and E2E tests
- **Fast**: Tests run quickly to support rapid development
- **Reliable**: Tests produce consistent results
- **Maintainable**: Clear, well-documented test suites

---

## Test Structure

```
tests/
├── unit/                           # Unit tests (individual functions)
│   ├── auth.test.js
│   ├── cardService.test.js
│   ├── practiceService.test.js
│   └── quizService.test.js
├── integration/                    # Integration tests (components + DB)
│   ├── auth.integration.test.js
│   ├── cards.integration.test.js
│   ├── practice.integration.test.js
│   └── quiz.integration.test.js
├── e2e/                            # End-to-end tests (full user flows)
│   ├── user-registration.e2e.test.js
│   ├── practice-session.e2e.test.js
│   ├── quiz-workflow.e2e.test.js
│   └── import-export.e2e.test.js
├── fixtures/                       # Test data
│   ├── users.fixture.js
│   ├── cards.fixture.js
│   └── quizzes.fixture.js
└── helpers/                        # Test utilities
    ├── db-setup.js                # Database initialization
    ├── test-server.js             # Test server instance
    └── auth-helper.js             # Authentication helpers
```

---

## Test Framework Selection

### Recommended Stack

- **Test Runner**: Jest
  - Fast, built-in assertions
  - Great for Node.js + async/await
  - Snapshot testing capability
  - Code coverage built-in

- **API Testing**: Supertest
  - HTTP assertions for Express routes
  - No need to manually start/stop server

- **Database**: sqlite (test instance) or postgres (with transaction rollback)
  - Lightweight testing database
  - Easy setup/teardown

- **Mocking**: Jest mocks + Sinon (optional)
  - Mock external services
  - Spy on function calls

### Package.json Updates

```json
{
  "devDependencies": {
    "jest": "^29.0.0",
    "supertest": "^6.3.0",
    "@testing-library/node": "^latest",
    "sqlite3": "^5.1.0"
  },
  "scripts": {
    "test": "jest",
    "test:watch": "jest --watch",
    "test:coverage": "jest --coverage",
    "test:unit": "jest tests/unit",
    "test:integration": "jest tests/integration",
    "test:e2e": "jest tests/e2e"
  }
}
```

---

## Unit Tests

### Authentication Service Tests

```javascript
// tests/unit/auth.test.js
describe('AuthService', () => {
  describe('hashPassword', () => {
    test('should hash password with bcrypt', async () => {
      const password = 'testPassword123';
      const hash = await authService.hashPassword(password);
      expect(hash).not.toBe(password);
      expect(hash).toMatch(/^\$2[aby]\$/); // bcrypt format
    });
  });

  describe('comparePassword', () => {
    test('should return true for matching passwords', async () => {
      const password = 'testPassword123';
      const hash = await authService.hashPassword(password);
      const result = await authService.comparePassword(password, hash);
      expect(result).toBe(true);
    });

    test('should return false for non-matching passwords', async () => {
      const hash = await authService.hashPassword('password123');
      const result = await authService.comparePassword('wrongPassword', hash);
      expect(result).toBe(false);
    });
  });

  describe('generateToken', () => {
    test('should generate valid JWT token', () => {
      const userId = 'test-user-id';
      const token = authService.generateToken(userId);
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      expect(decoded.userId).toBe(userId);
    });
  });
});
```

### Card Service Tests

```javascript
// tests/unit/cardService.test.js
describe('CardService', () => {
  describe('createCard', () => {
    test('should create a new flashcard', () => {
      const cardData = {
        question: 'What is 2+2?',
        answer: '4',
        category: 'Math',
        difficulty: 2,
      };
      const result = cardService.createCard('user123', cardData);
      expect(result).toHaveProperty('card_id');
      expect(result.question).toBe(cardData.question);
    });

    test('should throw error if required fields missing', () => {
      expect(() => cardService.createCard('user123', {})).toThrow(
        'Question and answer are required'
      );
    });
  });

  describe('validateCard', () => {
    test('should validate card structure', () => {
      const validCard = {
        question: 'Q',
        answer: 'A',
        category: 'Cat',
        difficulty: 3,
      };
      expect(() => cardService.validateCard(validCard)).not.toThrow();
    });

    test('should reject invalid difficulty', () => {
      const invalidCard = { question: 'Q', answer: 'A', difficulty: 10 };
      expect(() => cardService.validateCard(invalidCard)).toThrow('Difficulty must be 1-5');
    });
  });
});
```

### Practice System (Leitner Boxes) Tests

```javascript
// tests/unit/leitnerService.test.js
describe('LeitnerService - Box System', () => {
  describe('promoteCard', () => {
    test('should promote card from Box 1 to Box 2 on correct answer', () => {
      const box = {
        box_number: 1,
        card_id: 'card-123'
      };
      const result = leitnerService.promoteCard(box);
      expect(result.box_number).toBe(2);
      expect(result.next_review).toBeDefined();
    });

    test('should promote card from Box 2 to Box 3 on correct answer', () => {
      const box = { box_number: 2 };
      const result = leitnerService.promoteCard(box);
      expect(result.box_number).toBe(3);
    });

    test('should not promote card beyond Box 3', () => {
      const box = { box_number: 3 };
      const result = leitnerService.promoteCard(box);
      expect(result.box_number).toBe(3);
    });
  });

  describe('demoteCard', () => {
    test('should demote card from Box 2 to Box 1 on incorrect answer', () => {
      const box = { box_number: 2 };
      const result = leitnerService.demoteCard(box);
      expect(result.box_number).toBe(1);
      expect(result.next_review).toEqual(NOW() + 1 day);
    });

    test('should keep card in Box 1 if already there', () => {
      const box = { box_number: 1 };
      const result = leitnerService.demoteCard(box);
      expect(result.box_number).toBe(1);
    });
  });

  describe('calculateNextReview', () => {
    test('should schedule Box 1 cards for daily review', () => {
      const nextReview = leitnerService.calculateNextReview(1);
      const diff = nextReview.getTime() - Date.now();
      expect(diff).toBeCloseTo(1 * 24 * 60 * 60 * 1000, -4); // ~1 day
    });

    test('should schedule Box 2 cards for every 2 days', () => {
      const nextReview = leitnerService.calculateNextReview(2);
      const diff = nextReview.getTime() - Date.now();
      expect(diff).toBeCloseTo(2 * 24 * 60 * 60 * 1000, -4); // ~2 days
    });

    test('should schedule Box 3 cards for weekly review', () => {
      const nextReview = leitnerService.calculateNextReview(3);
      const diff = nextReview.getTime() - Date.now();
      expect(diff).toBeCloseTo(7 * 24 * 60 * 60 * 1000, -4); // ~7 days
    });
  });

  describe('getCardsForReview', () => {
    test('should return all Box 1 cards (daily review)', async () => {
      const userId = 'user-123';
      // Create test cards in Box 1
      const cards = await leitnerService.getCardsForReview(userId, 1);
      expect(cards.length).toBeGreaterThan(0);
      cards.forEach(card => {
        expect(card.box_number).toBe(1);
      });
    });

    test('should return Box 2 cards only if due (every 2 days)', async () => {
      const userId = 'user-123';
      const cards = await leitnerService.getCardsForReview(userId, 2);
      cards.forEach(card => {
        expect(card.next_review).toBeLessThanOrEqual(NOW());
      });
    });

    test('should return Box 3 cards only if due (weekly)', async () => {
      const userId = 'user-123';
      const cards = await leitnerService.getCardsForReview(userId, 3);
      cards.forEach(card => {
        expect(card.next_review).toBeLessThanOrEqual(NOW());
      });
    });
  });
});
```

### Integration: Practice with Leitner Boxes

```javascript
// tests/integration/practice.leitner.test.js
describe('Practice Session with Leitner Boxes', () => {
  test('correct answer promotes card through boxes', async () => {
    const user = await createTestUser();
    const card = await createTestCard(user.user_id);
    const token = generateTestToken(user.user_id);

    // Start session
    const sessionRes = await request(app)
      .post('/api/practice/start')
      .set('Authorization', `Bearer ${token}`)
      .send({ sessionType: 'daily' });
    const sessionId = sessionRes.body.sessionId;

    // Get first card - should be in Box 1
    const card1 = await request(app)
      .get(`/api/practice/${sessionId}/card`)
      .set('Authorization', `Bearer ${token}`);
    expect(card1.body.card.box).toBe(1);

    // Answer correctly - promote to Box 2
    await request(app)
      .post(`/api/practice/${sessionId}/answer`)
      .set('Authorization', `Bearer ${token}`)
      .send({ cardId: card.card_id, correct: true });

    // Verify in Box 2
    const boxRes = await request(app)
      .get(`/api/cards/${card.card_id}/box`)
      .set('Authorization', `Bearer ${token}`);
    expect(boxRes.body.box_number).toBe(2);
  });

  test('incorrect answer demotes card back to Box 1', async () => {
    const user = await createTestUser();
    const card = await createTestCard(user.user_id, { boxNumber: 2 });
    const token = generateTestToken(user.user_id);

    const sessionRes = await request(app)
      .post('/api/practice/start')
      .set('Authorization', `Bearer ${token}`);
    const sessionId = sessionRes.body.sessionId;

    // Answer incorrectly - demote to Box 1
    await request(app)
      .post(`/api/practice/${sessionId}/answer`)
      .set('Authorization', `Bearer ${token}`)
      .send({ cardId: card.card_id, correct: false });

    // Verify back in Box 1
    const boxRes = await request(app)
      .get(`/api/cards/${card.card_id}/box`)
      .set('Authorization', `Bearer ${token}`);
    expect(boxRes.body.box_number).toBe(1);
  });

  test('mastered cards in Box 3 reviewed weekly', async () => {
    const user = await createTestUser();
    const card = await createTestCard(user.user_id, { boxNumber: 3 });
    const token = generateTestToken(user.user_id);

    const boxRes = await request(app)
      .get(`/api/cards/${card.card_id}/box`)
      .set('Authorization', `Bearer ${token}`);

    const nextReview = new Date(boxRes.body.next_review);
    const daysUntilReview = (nextReview - Date.now()) / (1000 * 60 * 60 * 24);
    expect(daysUntilReview).toBeCloseTo(7, 1); // ~7 days
  });
});
```

---

## Integration Tests

### Authentication Integration Tests

```javascript
// tests/integration/auth.integration.test.js
describe('Authentication Integration', () => {
  beforeAll(async () => {
    await setupTestDatabase();
  });

  afterEach(async () => {
    await cleanupDatabase();
  });

  describe('POST /api/auth/register', () => {
    test('should register new user with valid data', async () => {
      const response = await request(app).post('/api/auth/register').send({
        username: 'testuser',
        email: 'test@example.com',
        password: 'SecurePass123!',
        fullName: 'Test User',
      });

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('token');
      expect(response.body.user.username).toBe('testuser');
    });

    test('should reject duplicate username', async () => {
      await createTestUser({ username: 'taken' });

      const response = await request(app).post('/api/auth/register').send({
        username: 'taken',
        email: 'new@example.com',
        password: 'Password123!',
      });

      expect(response.status).toBe(409);
      expect(response.body.error).toMatch(/username already exists/i);
    });

    test('should validate password strength', async () => {
      const response = await request(app).post('/api/auth/register').send({
        username: 'testuser',
        email: 'test@example.com',
        password: 'weak',
      });

      expect(response.status).toBe(400);
    });
  });

  describe('POST /api/auth/login', () => {
    test('should login with correct credentials', async () => {
      const user = await createTestUser({
        username: 'testuser',
        password: 'TestPassword123!',
      });

      const response = await request(app).post('/api/auth/login').send({
        username: 'testuser',
        password: 'TestPassword123!',
      });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('token');
    });

    test('should reject incorrect password', async () => {
      await createTestUser({ username: 'testuser', password: 'Correct123!' });

      const response = await request(app).post('/api/auth/login').send({
        username: 'testuser',
        password: 'WrongPassword!',
      });

      expect(response.status).toBe(401);
    });
  });
});
```

### Card Management Integration Tests

```javascript
// tests/integration/cards.integration.test.js
describe('Card Management Integration', () => {
  let authToken;
  let userId;

  beforeEach(async () => {
    const user = await createTestUser();
    userId = user.user_id;
    authToken = generateTestToken(userId);
  });

  describe('POST /api/cards (create)', () => {
    test('should create card for authenticated user', async () => {
      const response = await request(app)
        .post('/api/cards')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          question: 'Capital of France?',
          answer: 'Paris',
          category: 'Geography',
          difficulty: 2,
        });

      expect(response.status).toBe(201);
      expect(response.body.card).toHaveProperty('card_id');
    });

    test('should reject unauthenticated request', async () => {
      const response = await request(app).post('/api/cards').send({
        question: 'Test?',
        answer: 'Answer',
      });

      expect(response.status).toBe(401);
    });
  });

  describe('GET /api/cards (list)', () => {
    test("should return user's cards", async () => {
      await createTestCard(userId, { question: 'Q1', answer: 'A1' });
      await createTestCard(userId, { question: 'Q2', answer: 'A2' });

      const response = await request(app)
        .get('/api/cards')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.cards).toHaveLength(2);
    });

    test("should not return other users' cards", async () => {
      const otherUser = await createTestUser();
      await createTestCard(otherUser.user_id, { question: 'Secret', answer: 'Hidden' });

      const response = await request(app)
        .get('/api/cards')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.body.cards).toHaveLength(0);
    });
  });

  describe('PUT /api/cards/:id (update)', () => {
    test('should update card', async () => {
      const card = await createTestCard(userId, {
        question: 'Original',
        answer: 'A1',
      });

      const response = await request(app)
        .put(`/api/cards/${card.card_id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          question: 'Updated Question',
          difficulty: 4,
        });

      expect(response.status).toBe(200);
      expect(response.body.card.question).toBe('Updated Question');
    });
  });

  describe('DELETE /api/cards/:id', () => {
    test('should delete card', async () => {
      const card = await createTestCard(userId);

      const deleteResponse = await request(app)
        .delete(`/api/cards/${card.card_id}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(deleteResponse.status).toBe(204);

      const getResponse = await request(app)
        .get(`/api/cards/${card.card_id}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(getResponse.status).toBe(404);
    });
  });
});
```

---

## End-to-End Tests

### User Registration & Profile Flow

```javascript
// tests/e2e/user-registration.e2e.test.js
describe('User Registration & Profile Flow (E2E)', () => {
  describe('Complete user lifecycle', () => {
    test('user can register, login, update profile, and logout', async () => {
      // 1. Register
      const registerResponse = await request(app).post('/api/auth/register').send({
        username: 'e2euser',
        email: 'e2e@example.com',
        password: 'E2EPassword123!',
        fullName: 'E2E Test User',
      });
      expect(registerResponse.status).toBe(201);
      const token = registerResponse.body.token;

      // 2. Login with new credentials
      const loginResponse = await request(app).post('/api/auth/login').send({
        username: 'e2euser',
        password: 'E2EPassword123!',
      });
      expect(loginResponse.status).toBe(200);
      expect(loginResponse.body.token).toBeDefined();

      // 3. Update profile
      const updateResponse = await request(app)
        .put('/api/profile')
        .set('Authorization', `Bearer ${token}`)
        .send({
          fullName: 'Updated Name',
          password: 'NewPassword123!',
        });
      expect(updateResponse.status).toBe(200);

      // 4. Verify update with GET profile
      const getResponse = await request(app)
        .get('/api/profile')
        .set('Authorization', `Bearer ${token}`);
      expect(getResponse.body.user.fullName).toBe('Updated Name');

      // 5. Logout
      const logoutResponse = await request(app)
        .post('/api/auth/logout')
        .set('Authorization', `Bearer ${token}`);
      expect(logoutResponse.status).toBe(200);

      // 6. Verify token invalid after logout
      const protectedResponse = await request(app)
        .get('/api/profile')
        .set('Authorization', `Bearer ${token}`);
      expect(protectedResponse.status).toBe(401);
    });
  });
});
```

### Practice Session Flow

```javascript
// tests/e2e/practice-session.e2e.test.js
describe('Practice Session Flow (E2E)', () => {
  test('user can start practice session and review cards', async () => {
    const user = await createTestUser();
    const token = generateTestToken(user.user_id);

    // Create test cards
    const cards = await Promise.all([
      createTestCard(user.user_id, { question: 'Q1?', answer: 'A1' }),
      createTestCard(user.user_id, { question: 'Q2?', answer: 'A2' }),
      createTestCard(user.user_id, { question: 'Q3?', answer: 'A3' }),
    ]);

    // 1. Start practice session
    const startResponse = await request(app)
      .post('/api/practice/start')
      .set('Authorization', `Bearer ${token}`)
      .send({ sessionType: 'daily' });
    expect(startResponse.status).toBe(200);
    const sessionId = startResponse.body.sessionId;

    // 2. Get first card
    const card1Response = await request(app)
      .get(`/api/practice/${sessionId}/card`)
      .set('Authorization', `Bearer ${token}`);
    expect(card1Response.status).toBe(200);
    expect(card1Response.body.card).toHaveProperty('question');

    // 3. Submit answer (correct)
    const answer1Response = await request(app)
      .post(`/api/practice/${sessionId}/answer`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        cardId: card1Response.body.card.card_id,
        correct: true,
      });
    expect(answer1Response.status).toBe(200);

    // 4. Get next card
    const card2Response = await request(app)
      .get(`/api/practice/${sessionId}/card`)
      .set('Authorization', `Bearer ${token}`);
    expect(card2Response.body.card.card_id).not.toBe(card1Response.body.card.card_id);

    // 5. End session
    const endResponse = await request(app)
      .post(`/api/practice/${sessionId}/end`)
      .set('Authorization', `Bearer ${token}`);
    expect(endResponse.status).toBe(200);
    expect(endResponse.body.sessionSummary).toHaveProperty('correctCount');
  });
});
```

### Import/Export Flow

```javascript
// tests/e2e/import-export.e2e.test.js
describe('Import/Export Flow (E2E)', () => {
  test('user can export cards to JSON and import them back', async () => {
    const user = await createTestUser();
    const token = generateTestToken(user.user_id);

    // Create cards
    const cards = await Promise.all([
      createTestCard(user.user_id, { question: 'Q1?', answer: 'A1', category: 'Cat1' }),
      createTestCard(user.user_id, { question: 'Q2?', answer: 'A2', category: 'Cat2' }),
    ]);

    // Export
    const exportResponse = await request(app)
      .get('/api/cards/export')
      .set('Authorization', `Bearer ${token}`);
    expect(exportResponse.status).toBe(200);
    const exportedData = exportResponse.body;
    expect(exportedData.cards).toHaveLength(2);

    // Clear cards
    for (const card of cards) {
      await request(app)
        .delete(`/api/cards/${card.card_id}`)
        .set('Authorization', `Bearer ${token}`);
    }

    // Verify cleared
    const clearedResponse = await request(app)
      .get('/api/cards')
      .set('Authorization', `Bearer ${token}`);
    expect(clearedResponse.body.cards).toHaveLength(0);

    // Import
    const importResponse = await request(app)
      .post('/api/cards/import')
      .set('Authorization', `Bearer ${token}`)
      .send({ cards: exportedData.cards });
    expect(importResponse.status).toBe(201);

    // Verify imported
    const reimportedResponse = await request(app)
      .get('/api/cards')
      .set('Authorization', `Bearer ${token}`);
    expect(reimportedResponse.body.cards).toHaveLength(2);
    expect(reimportedResponse.body.cards[0].question).toBe('Q1?');
  });
});
```

---

## Test Execution Strategy

### Continuous Integration (GitHub Actions)

```yaml
# .github/workflows/tests.yml
name: Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest

    services:
      postgres:
        image: postgres:14
        env:
          POSTGRES_DB: flashcards_test
          POSTGRES_PASSWORD: testpass
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
        ports:
          - 5432:5432

    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'

      - run: npm ci
      - run: npm run test:unit
      - run: npm run test:integration
      - run: npm run test:coverage

      - uses: codecov/codecov-action@v3
        with:
          files: ./coverage/coverage-final.json
```

### Coverage Goals

- **Overall**: 80%+ coverage
- **Unit tests**: 90%+
- **Critical paths** (auth, payments): 95%+
- **Views**: 60% (HTML-heavy, less critical)

### Test Running Commands

```bash
npm test                    # Run all tests
npm run test:watch         # Watch mode for development
npm run test:coverage      # Generate coverage report
npm run test:unit          # Unit tests only
npm run test:integration   # Integration tests only
npm run test:e2e           # E2E tests only
```

---

## Test Data & Fixtures

### Fixture Pattern

```javascript
// tests/fixtures/users.fixture.js
export const createTestUser = async (overrides = {}) => {
  return db.insert('users', {
    user_id: generateUUID(),
    username: `testuser_${Date.now()}`,
    email: `test${Date.now()}@example.com`,
    password_hash: await hashPassword('DefaultPassword123!'),
    ...overrides,
  });
};

// tests/fixtures/cards.fixture.js
export const createTestCard = async (userId, overrides = {}) => {
  return db.insert('flashcards', {
    card_id: generateUUID(),
    user_id: userId,
    question: 'Test question?',
    answer: 'Test answer',
    category: 'Test',
    difficulty: 2,
    ...overrides,
  });
};
```

---

## Monitoring & Maintenance

- Run full test suite before every commit (pre-commit hook)
- Run tests on every PR
- Monitor test execution time; keep under 5 minutes
- Keep tests up-to-date with feature changes
- Review and update test data fixtures quarterly
