# Installation Guide for StockSense Pro (MacOS)

Follow these steps to set up and run StockSense Pro on your MacBook.

## Prerequisites
- **Node.js**: Version 18.17.0 or higher.
- **npm**: Usually comes with Node.js.

## Step 1: Clone or Download
Download the source code to a folder on your Mac (e.g., `~/Documents/stocksense-pro`).

## Step 2: Install Dependencies
Open your terminal, navigate to the project directory, and run:
```bash
npm install
```

## Step 3: Configure Environment Variables
You need a Gemini API key for the AI features (Chatbot and Predictions) to work.
1. Go to [Google AI Studio](https://aistudio.google.com/app/apikey) and create a free API key.
2. In the project root folder, create a file named `.env.local`.
3. Add the following line to `.env.local`:
```env
GEMINI_API_KEY=your_actual_api_key_here
GEMINI_MODEL=gemini-3-flash-preview
```

Do not use a `NEXT_PUBLIC_` prefix for API keys. AI calls are routed through server-side API routes.

## Step 4: Run the Application

### For Development (with live updates):
```bash
npm run dev
```
Then open [http://localhost:3000](http://localhost:3000) in your browser.

### For Production (Faster performance):
```bash
npm run build
npm run start
```

## Troubleshooting
- **API Errors**: Ensure your terminal has internet access. Yahoo Finance and Gemini API require an active connection.
- **Port Conflict**: If port 3000 is in use, you can run on a different port: `npm run dev -- -p 3001`.

## Disclaimer
StockSense Pro is for educational and analytical purposes only. It is not financial advice.
