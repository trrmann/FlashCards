# Leitner Box System Implementation Guide

## 📚 Overview

The FlashCards project now uses the **Leitner System**, a proven, low-tech spaced repetition methodology that's ideal for language learning and memorization. This replaces the complex SM-2 algorithm with a simpler, more intuitive 3-box system.

---

## 🎯 The 3-Box System

### Visual Flow

```
           STUDENT WORKFLOW

┌─────────────────────────────────────────────────────┐
│         START: All Cards in Box 1                   │
└────────────────────┬────────────────────────────────┘
                     │
        ┌────────────┴────────────┐
        │                         │
        ▼                         ▼
   CORRECT?                   INCORRECT?
     │                            │
     └──────────┬──────────┬──────┘
                │          │
                ▼          ▼
          PROMOTE      DEMOTE
          TO NEXT      BACK TO
          BOX          BOX 1


BOXES STRUCTURE

┌──────────────────────────────────────────────────────────┐
│  BOX 1: DAILY REVIEW                                     │
│  ───────────────────────────────────────────────────────│
│  • New cards                                             │
│  • Cards answered incorrectly                            │
│  • Review frequency: Every day                           │
│  • Study time: 10-20 minutes/day                         │
│  ✓ Correct → Move to Box 2                              │
│  ✗ Incorrect → Stay in Box 1                            │
└──────────────────────────────────────────────────────────┘
                            │
                    ✓ (correct answer)
                            ▼
┌──────────────────────────────────────────────────────────┐
│  BOX 2: EVERY 2 DAYS                                     │
│  ───────────────────────────────────────────────────────│
│  • Medium difficulty cards                              │
│  • Getting closer to mastery                            │
│  • Review frequency: Every 2 days (Mon/Wed/Fri)        │
│  • Study time: 5-10 minutes every 2 days               │
│  ✓ Correct → Move to Box 3                             │
│  ✗ Incorrect → Move back to Box 1                      │
└──────────────────────────────────────────────────────────┘
                            │
                    ✓ (correct answer)
                            ▼
┌──────────────────────────────────────────────────────────┐
│  BOX 3: WEEKLY REVIEW                                    │
│  ───────────────────────────────────────────────────────│
│  • Mastered cards                                       │
│  • Strong recall established                            │
│  • Review frequency: Once per week (Friday)            │
│  • Study time: 2-5 minutes per week                    │
│  ✓ Correct → Stay in Box 3 (mastered!)                │
│  ✗ Incorrect → Move back to Box 1 (drill again!)      │
└──────────────────────────────────────────────────────────┘

    ✗ (incorrect) - ANY BOX
          │
          └──────────────────────────────┐
                                         │
                                         ▼
                               BACK TO BOX 1 ↻
```

---

## 📊 How It Works in Practice

### Week 1 Example

**Monday:**

```
Box 1 (Daily):     15 new cards
Box 2 (2-day):     None
Box 3 (Weekly):    None

You study Box 1 cards:
  ✓ Correct on 12 cards → Promote to Box 2
  ✗ Incorrect on 3 cards → Stay in Box 1
```

**Tuesday:**

```
Box 1 (Daily):     3 cards (from yesterday's failures)
Box 2 (2-day):     Not due yet (wait until Wed)
Box 3 (Weekly):    None

Study the 3 Box 1 cards again:
  ✓ 2 correct → Move to Box 2
  ✗ 1 incorrect → Stay in Box 1
```

**Wednesday:**

```
Box 1 (Daily):     1 card (yesterday's failure)
Box 2 (2-day):     12 cards (promoted from Monday - now due!)
Box 3 (Weekly):    None

Study 1 Box 1 card + 12 Box 2 cards:
  Box 1: ✓ 1 correct → Move to Box 2
  Box 2: ✓ 10 correct → Move to Box 3
         ✗ 2 incorrect → Move back to Box 1
```

**Friday:**

```
Box 1 (Daily):     2 cards (Wed failures)
Box 2 (2-day):     Due again (last studied Wed)
Box 3 (Weekly):    10 cards (promoted from Wed)

Study time:
  Box 1: Practice the 2 struggling cards
  Box 2: Review the Box 2 cards again
  Box 3: Review mastered cards
```

### Key Insight

- **Box 1 requires most study time** (new material + struggle)
- **Box 2 requires moderate time** (reinforcement every 2 days)
- **Box 3 requires minimal time** (maintenance weekly)
- **Total weekly commitment**: ~1-2 hours, not spread daily

---

## 🗄️ Database Schema

### Table: `leitner_boxes`

```sql
CREATE TABLE leitner_boxes (
  box_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  card_id UUID NOT NULL REFERENCES flashcards(card_id) ON DELETE CASCADE,

  -- Current Position
  box_number INT NOT NULL CHECK (box_number >= 1 AND box_number <= 3),

  -- Tracking Metrics
  review_count INT DEFAULT 0,        -- Total times reviewed
  correct_count INT DEFAULT 0,       -- Times answered correctly
  incorrect_count INT DEFAULT 0,     -- Times answered incorrectly

  -- Scheduling
  last_reviewed TIMESTAMP,           -- Last review date
  next_review TIMESTAMP,             -- When to review next

  -- Metadata
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),

  -- Constraint: One entry per user-card pair
  UNIQUE(user_id, card_id)
);

-- Indexes for efficient queries
CREATE INDEX idx_leitner_boxes_user_id
  ON leitner_boxes(user_id);

CREATE INDEX idx_leitner_boxes_box_number
  ON leitner_boxes(user_id, box_number);

CREATE INDEX idx_leitner_boxes_next_review
  ON leitner_boxes(user_id, next_review);
```

---

## 🔄 Box Transition Logic

### Promotion (Correct Answer)

```javascript
function promoteCard(card) {
  if (card.box_number < 3) {
    card.box_number++;
  }

  // Schedule next review based on new box
  const intervals = {
    1: 1, // 1 day
    2: 2, // 2 days
    3: 7, // 7 days
  };

  const dayInterval = intervals[card.box_number];
  card.next_review = NOW() + dayInterval * 24 * 60 * 60 * 1000;

  return card;
}
```

**Logic:**

- Box 1 card answered correctly → Move to Box 2, next review in 2 days
- Box 2 card answered correctly → Move to Box 3, next review in 7 days
- Box 3 card answered correctly → Stay in Box 3, next review in 7 days

### Demotion (Incorrect Answer)

```javascript
function demoteCard(card) {
  // ALWAYS go back to Box 1
  card.box_number = 1;

  // Schedule immediate review (tomorrow)
  card.next_review = NOW() + 1 * 24 * 60 * 60 * 1000;

  return card;
}
```

**Logic:**

- ANY card answered incorrectly → Back to Box 1, next review tomorrow
- No partial credit, no "almost right"
- Forces aggressive drilling of weak concepts

---

## 🎮 API Implementation

### GET /api/practice/next-card

Returns the next card to study based on box priorities.

**Algorithm:**

1. Get all Box 1 cards (no scheduling, always available)
2. Get Box 2 cards where `next_review <= NOW()`
3. Get Box 3 cards where `next_review <= NOW()`
4. Prioritize: Box 1 > Box 2 > Box 3 (by urgency)
5. Return one card for review

**Request:**

```bash
GET /api/practice/next-card
Authorization: Bearer <TOKEN>
```

**Response:**

```json
{
  "card": {
    "card_id": "660e8400-e29b-41d4-a716-446655440001",
    "question": "What is the capital of France?",
    "box": 1,
    "reviewCount": 3,
    "nextReview": "2024-10-30T10:40:08Z"
  }
}
```

### POST /api/practice/submit-answer

Submit answer for current card, update box position.

**Request:**

```json
{
  "cardId": "660e8400-e29b-41d4-a716-446655440001",
  "correct": true
}
```

**Response (Promotion):**

```json
{
  "success": true,
  "result": {
    "correct": true,
    "correctAnswer": "Paris"
  },
  "boxUpdate": {
    "action": "promoted",
    "fromBox": 1,
    "toBox": 2,
    "message": "Great! Promoted to Box 2 (Every 2 Days)"
  },
  "schedule": {
    "nextReview": "2024-10-31T10:40:08Z",
    "reviewInterval": "2 days"
  },
  "boxStats": {
    "box1Cards": 5,
    "box2Cards": 8,
    "box3Cards": 2,
    "totalCards": 15,
    "accuracy": "86.7%"
  }
}
```

**Response (Demotion):**

```json
{
  "success": true,
  "result": {
    "correct": false,
    "correctAnswer": "Paris",
    "yourAnswer": "Rome"
  },
  "boxUpdate": {
    "action": "demoted",
    "fromBox": 2,
    "toBox": 1,
    "message": "Demoted to Box 1 - Review Daily"
  },
  "schedule": {
    "nextReview": "2024-10-30T10:40:08Z",
    "reviewInterval": "1 day"
  }
}
```

---

## 📈 Sample SQL Queries

### Get Cards Due Today

```sql
-- Get all cards due for review today
SELECT
  f.card_id,
  f.question,
  f.answer,
  lb.box_number,
  lb.review_count,
  lb.correct_count,
  CASE
    WHEN lb.box_number = 1 THEN 'Daily'
    WHEN lb.box_number = 2 THEN 'Every 2 Days'
    WHEN lb.box_number = 3 THEN 'Weekly'
  END as review_frequency
FROM flashcards f
JOIN leitner_boxes lb ON f.card_id = lb.card_id
WHERE lb.user_id = $1
  AND lb.next_review <= NOW()
ORDER BY lb.box_number ASC, lb.next_review ASC;
```

### Get Progress Stats

```sql
-- Show how many cards in each box
SELECT
  COUNT(CASE WHEN box_number = 1 THEN 1 END) as box1_new_cards,
  COUNT(CASE WHEN box_number = 2 THEN 1 END) as box2_medium_cards,
  COUNT(CASE WHEN box_number = 3 THEN 1 END) as box3_mastered_cards,
  COUNT(*) as total_cards,
  ROUND(100.0 * SUM(correct_count) /
        NULLIF(SUM(review_count), 0), 2) as overall_accuracy
FROM leitner_boxes
WHERE user_id = $1;
```

### Get Box 1 Focus (Weakest Cards)

```sql
-- Focus on the hardest cards that need most drilling
SELECT
  f.question,
  lb.review_count,
  lb.correct_count,
  ROUND(100.0 * lb.correct_count /
        NULLIF(lb.review_count, 0), 2) as accuracy_percent
FROM flashcards f
JOIN leitner_boxes lb ON f.card_id = lb.card_id
WHERE lb.user_id = $1
  AND lb.box_number = 1
ORDER BY lb.correct_count ASC, lb.review_count DESC
LIMIT 20;
```

---

## ✅ Implementation Checklist

### Phase 4 Todos:

- [ ] Create `leitner_boxes` table with schema
- [ ] Write `LeitnerService` class
  - [ ] `promoteCard()` - move to next box
  - [ ] `demoteCard()` - back to Box 1
  - [ ] `calculateNextReview()` - set review interval
  - [ ] `getCardsForReview()` - fetch cards due for each box
- [ ] Update `PracticeController`
  - [ ] `GET /api/practice/next-card` endpoint
  - [ ] `POST /api/practice/submit-answer` endpoint
- [ ] Write unit tests
  - [ ] Test promotion logic
  - [ ] Test demotion logic
  - [ ] Test scheduling
  - [ ] Test box priority selection
- [ ] Write integration tests
  - [ ] Test full study session
  - [ ] Test card movement through boxes
  - [ ] Test accuracy calculations

---

## 🧪 Test Examples

### Unit Test: Promotion

```javascript
describe('LeitnerService', () => {
  describe('promoteCard', () => {
    it('should promote Box 1 to Box 2', () => {
      const card = { box_number: 1 };
      const result = leitnerService.promoteCard(card);

      expect(result.box_number).toBe(2);
      expect(result.next_review).toBeDefined();
    });

    it('should not exceed Box 3', () => {
      const card = { box_number: 3 };
      const result = leitnerService.promoteCard(card);

      expect(result.box_number).toBe(3);
    });
  });

  describe('demoteCard', () => {
    it('should demote any box to Box 1', () => {
      const card = { box_number: 3 };
      const result = leitnerService.demoteCard(card);

      expect(result.box_number).toBe(1);
    });
  });
});
```

### Integration Test: Study Session

```javascript
describe('Practice Session with Leitner', () => {
  it('should complete full session', async () => {
    const user = await createTestUser();
    const cards = await createTestCards(user, 10);
    const token = generateTestToken(user);

    // Start session
    const session = await request(app)
      .post('/api/practice/start')
      .set('Authorization', `Bearer ${token}`);

    // Study 5 cards
    for (let i = 0; i < 5; i++) {
      const card = await request(app)
        .get(`/api/practice/${session.sessionId}/card`)
        .set('Authorization', `Bearer ${token}`);

      await request(app)
        .post(`/api/practice/${session.sessionId}/answer`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          cardId: card.body.card.card_id,
          correct: i < 4, // 4 correct, 1 incorrect
        });
    }

    // Verify boxes
    const stats = await request(app)
      .get('/api/practice/stats')
      .set('Authorization', `Bearer ${token}`);

    expect(stats.body.box1Count).toBeGreaterThan(0); // The incorrect one
    expect(stats.body.box2Count).toBe(4); // The correct ones promoted
  });
});
```

---

## 📚 Why Leitner System?

### Advantages

✅ **Scientifically Proven**

- Used since 1970s
- Based on spaced repetition principle
- Backed by learning science research

✅ **Simple Implementation**

- No complex algorithms
- Easy to understand and use
- Predictable scheduling

✅ **Focused Study**

- Automatic prioritization of weak cards
- Efficient use of study time
- Clear progression path

✅ **Motivating**

- Visual progress (cards moving through boxes)
- Clear sense of achievement
- Measurable improvement

✅ **Flexible**

- Can pause/resume without state issues
- Works with any number of cards
- Adaptable to different learning speeds

✅ **Language Learning Perfect**

- Ideal for vocabulary retention
- Builds confidence systematically
- Proven effective by BYU & other institutions

### Comparison to SM-2

| Aspect            | SM-2             | Leitner       |
| ----------------- | ---------------- | ------------- |
| Complexity        | High (algorithm) | Low (3 boxes) |
| Learning Curve    | Steep            | Flat          |
| Implementation    | Complex          | Simple        |
| Predictability    | Variable         | Fixed         |
| Beginner-Friendly | No               | Yes ✅        |
| Debugging Issues  | Hard             | Easy          |
| Study Efficiency  | Good             | Good ✅       |

---

## 🎓 Student Experience

### Daily Workflow

**Monday**

- Open app, see "Box 1: 15 cards due"
- Spend 15 minutes drilling new/weak cards
- 12 correct → move to Box 2
- 3 incorrect → stay in Box 1

**Tuesday**

- "Box 1: 3 cards due" (yesterday's failures)
- 5-minute quick review

**Wednesday**

- "Box 1: 2 cards" + "Box 2: 12 cards due"
- 20 minutes reviewing old + new

**Thursday**

- "Box 1: 2 cards"
- Quick daily review

**Friday**

- "Box 1: 1 card" + "Box 2: some" + "Box 3: 10 cards due (weekly)"
- Comprehensive weekly review, 30 minutes

**Saturday/Sunday**

- Review optional (no scheduled boxes)
- Can optionally review any box

### Progress Over Time

**Week 1:** Box 1 has 50 cards (all new)
**Week 2:** Box 1 has 20, Box 2 has 25, Box 3 has 5
**Week 3:** Box 1 has 10, Box 2 has 30, Box 3 has 15
**Week 4:** Box 1 has 5, Box 2 has 35, Box 3 has 20
**Month 2:** Box 1 has 5-10 (new additions), Box 2 has 25, Box 3 has 65+ (mastered!)

---

## 📞 Questions & Support

For more information:

- See [DATABASE_SCHEMA.md](./DATABASE_SCHEMA.md) for full schema
- See [API_ENDPOINTS.md](./API_ENDPOINTS.md) for endpoint details
- See [TESTING_STRATEGY.md](./TESTING_STRATEGY.md) for test examples
- See [ARCHITECTURE.md](./ARCHITECTURE.md) for data flows

This methodology is proven, simple, and perfect for language learning!
