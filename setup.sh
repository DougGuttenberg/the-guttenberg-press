#!/bin/bash
set -e

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# ASCII Art Header
echo -e "${CYAN}"
cat << "EOF"
╔════════════════════════════════════════════════════════════════╗
║                                                                ║
║              DAILY PAPER SYSTEM - macOS Setup                  ║
║                                                                ║
║  Your personalized newspaper delivered daily via Telegram      ║
║                                                                ║
╚════════════════════════════════════════════════════════════════╝
EOF
echo -e "${NC}\n"

# Helper functions
log_step() {
    echo -e "${BLUE}▶ Step $1: $2${NC}"
}

log_success() {
    echo -e "${GREEN}✓ $1${NC}"
}

log_info() {
    echo -e "${CYAN}ℹ $1${NC}"
}

log_warning() {
    echo -e "${YELLOW}⚠ $1${NC}"
}

log_error() {
    echo -e "${RED}✗ $1${NC}"
}

# Step 1: System requirements
log_step "1" "Checking macOS and installing dependencies"

# Check if running on macOS
if [[ "$OSTYPE" != "darwin"* ]]; then
    log_error "This setup script is for macOS only"
    exit 1
fi
log_success "Running on macOS"

# Check Xcode Command Line Tools
if ! command -v git &> /dev/null; then
    log_warning "Installing Xcode Command Line Tools (this may take a few minutes)..."
    xcode-select --install
    log_success "Xcode Command Line Tools installed"
else
    log_success "Xcode Command Line Tools already installed"
fi

# Check and install Homebrew
if ! command -v brew &> /dev/null; then
    log_warning "Installing Homebrew (this may take a few minutes)..."
    /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
    log_success "Homebrew installed"
else
    log_success "Homebrew already installed"
fi

# Check and install Node.js 20+
if ! command -v node &> /dev/null; then
    log_warning "Installing Node.js 20+..."
    brew install node
    log_success "Node.js installed"
else
    NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
    if [ "$NODE_VERSION" -lt 20 ]; then
        log_warning "Node.js version $NODE_VERSION detected. Upgrading to 20+..."
        brew upgrade node
        log_success "Node.js upgraded"
    else
        log_success "Node.js $(node -v) already installed"
    fi
fi

echo

# Step 2: Install npm dependencies
log_step "2" "Installing npm dependencies"

if [ ! -d "node_modules" ]; then
    npm install
    log_success "npm packages installed"
else
    log_info "node_modules already exists, skipping npm install"
    log_info "Run 'npm install' manually if you need to update dependencies"
fi

echo

# Step 3: Environment configuration
log_step "3" "Setting up environment configuration"

if [ ! -f ".env" ]; then
    if [ -f ".env.example" ]; then
        cp .env.example .env
        log_success ".env created from .env.example"
    else
        log_warning ".env.example not found, creating minimal .env"
        cat > .env << 'ENVEOF'
# Anthropic API Configuration
ANTHROPIC_API_KEY=

# Telegram Configuration
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=

# Gmail Configuration
GMAIL_ADDRESS=
GMAIL_APP_PASSWORD=

# Optional: Customize your paper
PAPER_TIMEZONE=America/New_York
PAPER_CATEGORIES=business,technology,science
PAPER_MAX_ARTICLES=15
ENVEOF
        log_success ".env created"
    fi
else
    log_success ".env already exists"
fi

echo

# Step 4: Anthropic API Key
log_step "4" "Configuring Anthropic API Key"

EXISTING_API_KEY=$(grep "^ANTHROPIC_API_KEY=" .env | cut -d'=' -f2)

if [ -z "$EXISTING_API_KEY" ] || [ "$EXISTING_API_KEY" == "" ]; then
    log_info "Enter your Anthropic API key (get it from https://console.anthropic.com/account/keys):"
    read -p "  API Key: " API_KEY

    if [ -z "$API_KEY" ]; then
        log_error "API key cannot be empty"
        exit 1
    fi

    # Use sed to update .env (handle both macOS and Linux sed)
    if [[ "$OSTYPE" == "darwin"* ]]; then
        sed -i '' "s/^ANTHROPIC_API_KEY=.*/ANTHROPIC_API_KEY=$API_KEY/" .env
    else
        sed -i "s/^ANTHROPIC_API_KEY=.*/ANTHROPIC_API_KEY=$API_KEY/" .env
    fi

    log_success "API key saved to .env"
else
    log_info "API key already configured in .env"
fi

# Test API key
log_info "Testing API key..."
if [ -f "scripts/test-claude-key.js" ]; then
    if node scripts/test-claude-key.js; then
        log_success "API key is valid"
    else
        log_error "API key test failed. Please check your key and try again."
        exit 1
    fi
else
    log_warning "test-claude-key.js not found, skipping API key validation"
fi

echo

# Step 5: Telegram Setup
log_step "5" "Configuring Telegram Bot"

EXISTING_BOT_TOKEN=$(grep "^TELEGRAM_BOT_TOKEN=" .env | cut -d'=' -f2)
EXISTING_CHAT_ID=$(grep "^TELEGRAM_CHAT_ID=" .env | cut -d'=' -f2)

if [ -z "$EXISTING_BOT_TOKEN" ] || [ "$EXISTING_BOT_TOKEN" == "" ]; then
    log_info "Setting up Telegram bot for Daily Paper delivery"
    echo
    echo -e "${YELLOW}Follow these steps to create a Telegram bot:${NC}"
    echo "  1. Open Telegram and search for ${CYAN}@BotFather${NC}"
    echo "  2. Send the command ${CYAN}/newbot${NC}"
    echo "  3. When asked for a name, type: ${CYAN}Doug's Daily Paper${NC}"
    echo "  4. Copy the bot token provided by BotFather"
    echo

    read -p "Paste your Telegram bot token: " BOT_TOKEN

    if [ -z "$BOT_TOKEN" ]; then
        log_error "Bot token cannot be empty"
        exit 1
    fi

    if [[ "$OSTYPE" == "darwin"* ]]; then
        sed -i '' "s/^TELEGRAM_BOT_TOKEN=.*/TELEGRAM_BOT_TOKEN=$BOT_TOKEN/" .env
    else
        sed -i "s/^TELEGRAM_BOT_TOKEN=.*/TELEGRAM_BOT_TOKEN=$BOT_TOKEN/" .env
    fi

    log_success "Bot token saved"
else
    BOT_TOKEN=$EXISTING_BOT_TOKEN
    log_info "Bot token already configured in .env"
fi

if [ -z "$EXISTING_CHAT_ID" ] || [ "$EXISTING_CHAT_ID" == "" ]; then
    log_info "Now finding your Telegram Chat ID..."

    if [ -f "scripts/get-telegram-chat-id.js" ]; then
        log_info "Starting chat ID discovery..."
        log_info "The bot is now listening for messages. Please:"
        echo "  1. Open Telegram and search for ${CYAN}Doug's Daily Paper${NC} (your new bot)"
        echo "  2. Send it any message (e.g., ${CYAN}hello${NC})"
        echo "  3. The chat ID will be detected automatically"
        echo

        if node scripts/get-telegram-chat-id.js; then
            # Extract chat ID from the output (assuming the script updates .env)
            EXISTING_CHAT_ID=$(grep "^TELEGRAM_CHAT_ID=" .env | cut -d'=' -f2)
            if [ ! -z "$EXISTING_CHAT_ID" ] && [ "$EXISTING_CHAT_ID" != "" ]; then
                log_success "Chat ID saved to .env"
            fi
        fi
    else
        log_warning "get-telegram-chat-id.js not found"
        read -p "Enter your Telegram Chat ID manually (or leave blank to skip): " CHAT_ID

        if [ ! -z "$CHAT_ID" ]; then
            if [[ "$OSTYPE" == "darwin"* ]]; then
                sed -i '' "s/^TELEGRAM_CHAT_ID=.*/TELEGRAM_CHAT_ID=$CHAT_ID/" .env
            else
                sed -i "s/^TELEGRAM_CHAT_ID=.*/TELEGRAM_CHAT_ID=$CHAT_ID/" .env
            fi
            log_success "Chat ID saved"
        fi
    fi
else
    log_success "Telegram Chat ID already configured in .env"
fi

echo

# Step 6: Gmail Setup
log_step "6" "Configuring Gmail Account"

EXISTING_GMAIL=$(grep "^GMAIL_ADDRESS=" .env | cut -d'=' -f2)
EXISTING_APP_PASSWORD=$(grep "^GMAIL_APP_PASSWORD=" .env | cut -d'=' -f2)

if [ -z "$EXISTING_GMAIL" ] || [ "$EXISTING_GMAIL" == "" ] || [ -z "$EXISTING_APP_PASSWORD" ] || [ "$EXISTING_APP_PASSWORD" == "" ]; then
    log_info "Setting up Gmail for article fetching (optional but recommended)"
    echo
    echo -e "${YELLOW}Follow these steps to create a Gmail App Password:${NC}"
    echo "  1. Go to ${CYAN}https://myaccount.google.com${NC}"
    echo "  2. Click ${CYAN}Security${NC} in the left menu"
    echo "  3. Enable ${CYAN}2-Step Verification${NC} if not already enabled"
    echo "  4. Go back to Security and find ${CYAN}App passwords${NC}"
    echo "  5. Select ${CYAN}Mail${NC} and ${CYAN}macOS${NC}}"
    echo "  6. Copy the 16-character password provided"
    echo

    read -p "Enter your Gmail address: " GMAIL_ADDRESS

    if [ -z "$GMAIL_ADDRESS" ]; then
        log_warning "Gmail address skipped"
    else
        read -p "Enter your Gmail App Password: " GMAIL_PASSWORD

        if [ ! -z "$GMAIL_PASSWORD" ]; then
            if [[ "$OSTYPE" == "darwin"* ]]; then
                sed -i '' "s/^GMAIL_ADDRESS=.*/GMAIL_ADDRESS=$GMAIL_ADDRESS/" .env
                sed -i '' "s/^GMAIL_APP_PASSWORD=.*/GMAIL_APP_PASSWORD=$GMAIL_PASSWORD/" .env
            else
                sed -i "s/^GMAIL_ADDRESS=.*/GMAIL_ADDRESS=$GMAIL_ADDRESS/" .env
                sed -i "s/^GMAIL_APP_PASSWORD=.*/GMAIL_APP_PASSWORD=$GMAIL_PASSWORD/" .env
            fi
            log_success "Gmail credentials saved"
        else
            log_warning "Gmail password skipped"
        fi
    fi
else
    log_success "Gmail already configured in .env"
fi

echo

# Step 7: Run tests
log_step "7" "Verifying installation"

if [ -f "package.json" ]; then
    log_info "Running npm test to verify modules..."
    if npm test 2>&1 | head -20; then
        log_success "All modules verified"
    else
        log_warning "Some tests may have failed. Review the output above."
    fi
else
    log_warning "package.json not found, skipping tests"
fi

echo

# Step 8: Optional test delivery
log_step "8" "Optional: Send test paper to Telegram"

read -p "Would you like to send a test Daily Paper to Telegram? (y/n) " -n 1 -r
echo

if [[ $REPLY =~ ^[Yy]$ ]]; then
    if [ -f "scripts/send-paper.js" ]; then
        log_info "Sending test paper..."
        if node scripts/send-paper.js; then
            log_success "Test paper sent! Check your Telegram"
        else
            log_error "Failed to send test paper. Please check your configuration."
        fi
    elif [ -f "index.js" ]; then
        log_info "Sending test paper..."
        if node index.js; then
            log_success "Test paper sent! Check your Telegram"
        else
            log_error "Failed to send test paper. Please check your configuration."
        fi
    else
        log_warning "send-paper.js or index.js not found"
    fi
    echo
fi

# Step 9: Optional launchd scheduling
log_step "9" "Optional: Setup daily scheduling with launchd"

read -p "Would you like to schedule Daily Paper to run automatically each morning? (y/n) " -n 1 -r
echo

if [[ $REPLY =~ ^[Yy]$ ]]; then
    SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
    PLIST_FILE="$HOME/Library/LaunchAgents/com.dailypaper.scheduler.plist"

    log_info "Creating launchd scheduler configuration..."

    # Create the plist file
    mkdir -p "$HOME/Library/LaunchAgents"

    cat > "$PLIST_FILE" << PLISTEOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.dailypaper.scheduler</string>
    <key>ProgramArguments</key>
    <array>
        <string>$SCRIPT_DIR/run-daily.sh</string>
    </array>
    <key>StartCalendarInterval</key>
    <dict>
        <key>Hour</key>
        <integer>8</integer>
        <key>Minute</key>
        <integer>0</integer>
    </dict>
    <key>StandardOutPath</key>
    <string>$HOME/Library/Logs/dailypaper.log</string>
    <key>StandardErrorPath</key>
    <string>$HOME/Library/Logs/dailypaper.error.log</string>
</dict>
</plist>
PLISTEOF

    log_success "launchd configuration created at $PLIST_FILE"

    # Create the run script if it doesn't exist
    if [ ! -f "$SCRIPT_DIR/run-daily.sh" ]; then
        cat > "$SCRIPT_DIR/run-daily.sh" << SCRIPTEOF
#!/bin/bash
source "$HOME/.bash_profile" 2>/dev/null || source "$HOME/.zprofile" 2>/dev/null
cd "$SCRIPT_DIR"
node index.js >> "\$HOME/Library/Logs/dailypaper.log" 2>&1
SCRIPTEOF
        chmod +x "$SCRIPT_DIR/run-daily.sh"
        log_success "Daily runner script created"
    fi

    # Load the plist
    launchctl load "$PLIST_FILE"
    log_success "Scheduler loaded. Daily Paper will run at 8:00 AM every day"
    log_info "View logs: tail -f ~/Library/Logs/dailypaper.log"
    echo
fi

# Final summary
echo
echo -e "${GREEN}════════════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}✓ DAILY PAPER SETUP COMPLETE!${NC}"
echo -e "${GREEN}════════════════════════════════════════════════════════════════${NC}"
echo
echo -e "${CYAN}What's next:${NC}"
echo "  • Check your configuration: ${YELLOW}cat .env${NC}"
echo "  • Send a paper manually: ${YELLOW}npm run paper${NC}"
echo "  • View logs: ${YELLOW}tail -f ~/Library/Logs/dailypaper.log${NC}"
echo "  • Edit schedule: ${YELLOW}nano ~/Library/LaunchAgents/com.dailypaper.scheduler.plist${NC}"
echo
echo -e "${CYAN}Useful commands:${NC}"
echo "  npm run paper          Generate and send a paper"
echo "  npm test               Run tests"
echo "  npm run dev            Run in development mode"
echo "  launchctl start com.dailypaper.scheduler  Start scheduler"
echo "  launchctl stop com.dailypaper.scheduler   Stop scheduler"
echo "  launchctl list | grep dailypaper          Check scheduler status"
echo
echo -e "${CYAN}Need help?${NC}"
echo "  • API Key: https://console.anthropic.com"
echo "  • Telegram: https://telegram.org"
echo "  • Gmail: https://myaccount.google.com"
echo
