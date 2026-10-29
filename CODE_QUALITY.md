# Code Quality: Linting & Formatting

## Overview

This project uses **ESLint** for code linting and **Prettier** for code formatting to ensure consistent code quality and style.

### Tools

- **ESLint v10** - Identifies and fixes JavaScript code issues
- **Prettier** - Formats code to consistent style
- **eslint-plugin-prettier** - Integrates Prettier into ESLint

## Quick Start

### Format Code

```bash
npm run format       # Format all code files
npm run format:check # Check formatting without changes
```

### Verify Code

```bash
npm run lint         # Check for linting issues
npm run lint:fix     # Auto-fix fixable issues
npm run verify       # Format then lint (complete verification)
```

## Available Commands

| Command                | Purpose                     | Fixes Auto?     |
| ---------------------- | --------------------------- | --------------- |
| `npm run format`       | Format code with Prettier   | ✅ Yes          |
| `npm run format:check` | Check formatting only       | ❌ No           |
| `npm run lint`         | Verify code quality         | ❌ View only    |
| `npm run lint:fix`     | Auto-fix issues             | ✅ Yes          |
| `npm run verify`       | Format → Lint (full verify) | ✅ Format fixed |

## Configuration Files

### `.prettierrc.json`

Prettier formatting rules:

- **Semi-colons:** Required
- **Quotes:** Single quotes (with escape option)
- **Indentation:** 2 spaces
- **Trailing commas:** ES5 compatible (objects & arrays only)
- **Line width:** 100 characters
- **Arrow functions:** Always include parens

Example:

```javascript
// ✅ Correct
const greet = (name) => {
  console.log(`Hello, ${name}`);
};

// ❌ Incorrect (will be auto-formatted)
const greet = (name) => {
  console.log(`Hello, ${name}`);
};
```

### `eslint.config.js`

ESLint configuration (flat config format):

- **Environment:** Node.js, ES2024
- **Parser:** Standard JavaScript parser
- **Recommended rules:** All ESLint recommended rules
- **Code style:** Enforces best practices and consistency

Key rules:

- `no-console` - OFF (Node.js apps use console)
- `no-unused-vars` - ERROR (except prefixed with `_`)
- `no-var` - ERROR (use `const`/`let`)
- `prefer-const` - ERROR
- `eqeqeq` - ERROR (always use `===`)
- `curly` - ERROR (always use braces)
- Spacing, indentation, and style rules

### `.prettierignore`

Files Prettier skips:

- `node_modules`, `dist`, `build`
- `.git`, `.deployment`
- `.env` files
- VSCode/IDE config
- Logs and lock files

## Deployment Integration

### Preview Environment

The preview environment (`./deploy.sh -preview`) automatically runs strict code verification:

1. **Format code** - Prettier writes formatted code
2. **Verify with linter** - ESLint checks all rules
3. **Abort on error** - If linting fails, deployment aborts

Preview deployment **fails** if:

- ❌ Formatting changes are needed
- ❌ Linting rules are violated

### Development Environment

The development environment (`./deploy.sh -dev`) runs checks but **does not abort**:

- ⚠️ Warnings only - deployment continues
- Useful for active development

### Production Environment

The production environment (`./deploy.sh -prod`) uses the same checks as dev:

- ⚠️ Warnings only - GitHub push proceeds
- Code quality is developer's responsibility

## Workflow

### Development Cycle

1. **Write code**

   ```bash
   # Make changes to your code
   ```

2. **Format locally** (recommended before committing)

   ```bash
   npm run format
   ```

3. **Check for issues**

   ```bash
   npm run lint
   ```

4. **Auto-fix what you can**

   ```bash
   npm run lint:fix
   ```

5. **Full verification**

   ```bash
   npm run verify      # Format + lint
   ```

6. **Commit and push**

   ```bash
   git add .
   git commit -m "Your message"
   git push origin main
   ```

7. **Deploy to preview**
   ```bash
   ./deploy.sh -preview    # Will verify code before starting server
   ```

### Typical Issues & Fixes

#### Formatting Issues

Problem: Lines too long or inconsistent spacing

```bash
npm run format  # Prettier auto-fixes
```

#### Linting Issues

Problem: `no-unused-vars`, `prefer-const`, style violations

```bash
# View issues
npm run lint

# Auto-fix what's possible
npm run lint:fix

# Manual fixes needed for some issues (e.g., logic errors)
```

#### Mixed Issues

Problem: Both formatting and linting issues

```bash
npm run verify  # Format first, then check linting
```

## Rule Violations

### Common Errors

**Error:** `Unexpected var, use let or const`

```javascript
// ❌ Wrong
var name = 'John';

// ✅ Correct
const name = 'John';
```

**Error:** `'name' is assigned a value but never used`

```javascript
// ❌ Wrong
const name = 'John';

// ✅ Correct (ignore with underscore prefix)
const _name = 'John'; // Intentionally unused
```

**Error:** `Expected === but got ==`

```javascript
// ❌ Wrong
if (value == true) {
}

// ✅ Correct
if (value === true) {
}
```

**Error:** `Missing function curly braces`

```javascript
// ❌ Wrong
if (value) console.log('yes');

// ✅ Correct
if (value) {
  console.log('yes');
}
```

## CI/CD Integration

### Before Preview Deployment

The deploy script automatically:

1. Runs `npm run format` - formats all code
2. Runs `npm run lint` - verifies with ESLint
3. **Aborts** if linting fails

This ensures preview environment always has verified code.

## Overriding Rules

### Disable ESLint for Specific Lines

```javascript
// eslint-disable-next-line no-console
console.log('Important debug info');
```

### Disable for Entire File

```javascript
/* eslint-disable no-console */
// ... file contents
```

### Disable Specific Rule

```javascript
// eslint-disable-next-line prefer-const
let value = 10; // Good reason to use let
```

## IDE Integration

### VS Code

Install extensions:

- **ESLint** - ms-vscode.vscode-eslint
- **Prettier** - esbenp.prettier-vscode

Add to `.vscode/settings.json`:

```json
{
  "editor.formatOnSave": true,
  "[javascript]": {
    "editor.defaultFormatter": "esbenp.prettier-vscode"
  }
}
```

### WebStorm

- Settings → Languages & Frameworks → JavaScript → Code Style
- Choose "Project" and it auto-uses `.prettierrc.json`
- Built-in ESLint support

## Troubleshooting

### "ESLint: Failed to load module"

```bash
npm install  # Reinstall dependencies
```

### "Prettier: Options are deprecated"

Update `.prettierrc.json` with valid options only.

### Port already in use during `./deploy.sh -preview`

The script auto-kills the port, but if it fails:

```bash
lsof -i :5000
kill -9 <PID>
./deploy.sh -preview
```

### Format/Lint commands not found

```bash
npm install  # Ensure devDependencies installed
npm run verify --verbose  # See what's happening
```

## Performance

Typical run times:

- `npm run format` - 5-10 seconds
- `npm run lint` - 3-5 seconds
- `npm run verify` - 8-15 seconds
- `./deploy.sh -preview` - adds 15-20 seconds for verification

## References

- [ESLint Documentation](https://eslint.org/)
- [Prettier Documentation](https://prettier.io/)
- [ESLint Flat Config](https://eslint.org/docs/latest/use/configure/migration-guide)

## Summary

✅ **Format:** `npm run format`  
✅ **Lint:** `npm run lint`  
✅ **Verify All:** `npm run verify`  
✅ **Auto-fix:** `npm run lint:fix`  
✅ **Preview Deploy:** `./deploy.sh -preview` (auto-verifies)

All code is verified before preview deployment!
