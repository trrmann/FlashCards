# Making deploy.sh Accessible from Anywhere

The `deploy.sh` script can now be executed from anywhere in the terminal while in the project. Here are your options:

## Option 1: Run from Project Root (Recommended)

Always run the script from the project root directory:

```bash
cd /home/tmann/Documents/Projects/FlashCards
./deploy.sh -dev
```

## Option 2: Use Full Path from Anywhere

```bash
/home/tmann/Documents/Projects/FlashCards/deploy.sh -dev
```

## Option 3: Add Project Alias to Shell Profile

Create an alias in your shell configuration so you can use `deploy` from anywhere.

### For Bash Users (.bashrc)

```bash
# Add this line to ~/.bashrc
alias deploy='/home/tmann/Documents/Projects/FlashCards/deploy.sh'

# Then reload:
source ~/.bashrc

# Now use it anywhere:
deploy -dev
deploy -preview
deploy -prod
deploy -all
```

### For Zsh Users (.zshrc)

```bash
# Add this line to ~/.zshrc
alias deploy='/home/tmann/Documents/Projects/FlashCards/deploy.sh'

# Then reload:
source ~/.zshrc

# Now use it anywhere:
deploy -dev
```

## Option 4: Add to PATH

Add the deploy script directory to your PATH:

```bash
# Add this line to ~/.bashrc or ~/.zshrc
export PATH="$PATH:/home/tmann/Documents/Projects/FlashCards"

# Then reload:
source ~/.bashrc  # or source ~/.zshrc

# Now use it anywhere:
deploy.sh -dev
```

## Option 5: Create a Global Script Link

Create a symbolic link in a directory that's already in your PATH:

```bash
# Find a PATH directory (e.g., /usr/local/bin)
echo $PATH

# Create a symlink
sudo ln -s /home/tmann/Documents/Projects/FlashCards/deploy.sh /usr/local/bin/fc-deploy

# Now use it anywhere:
fc-deploy -dev
fc-deploy -preview
fc-deploy -prod
fc-deploy -all
```

---

## How the Script Works Now

The script has been updated to:

1. **Detect its own location** using `SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"`
2. **Change to the project root** with `cd "${PROJECT_ROOT}"`
3. **Set all paths relative to project root** (logs, .env, server.js)

This means:

- ✅ You can call it with a full path from anywhere: `/home/tmann/Documents/Projects/FlashCards/deploy.sh -dev`
- ✅ You can call it with `./deploy.sh` from the project root
- ✅ You can add it as an alias for convenience
- ✅ It will find the project root even if called from a subdirectory path

## Recommended Setup

Add this to your shell profile (`~/.bashrc` or `~/.zshrc`):

```bash
# FlashCards deployment
alias deploy='cd /home/tmann/Documents/Projects/FlashCards && ./deploy.sh'
```

Then from anywhere in your terminal:

```bash
deploy -dev        # Start development
deploy -preview    # Test preview
deploy -prod       # Deploy to production
deploy -all        # Full pipeline
deploy -h          # Show help
```

This is the simplest and most portable approach.

---

## Testing

Verify the script works from different locations:

```bash
# From project root
cd /home/tmann/Documents/Projects/FlashCards
./deploy.sh -h

# From project subdirectory
cd /home/tmann/Documents/Projects/FlashCards/src
/home/tmann/Documents/Projects/FlashCards/deploy.sh -h

# From anywhere with full path
cd /tmp
/home/tmann/Documents/Projects/FlashCards/deploy.sh -h

# Using alias (after setup)
deploy -h
```

All of these methods work!
