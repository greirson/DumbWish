# DumbWish

A stupidly simple self-hostable wishlist app. Part of the DumbWare family of apps.

## Features

- Simple wishlist with Title, URL, Price, Note, and Image
- Public view access
- Protected admin access with PIN authentication (4-10 digits)
- Data stored in a simple JSON file
- Easy to deploy with Docker
- Configurable currency with standard currency codes
- Dark/Light mode support

## Quick Start

Copy this docker-compose.yml:

```yaml
version: '3'

services:
  dumbwish:
    image: dumbwareio/dumbwish:latest
    container_name: dumbwish
    ports:
      - "3000:3000"
    environment:
      - DUMBDO_PIN=1234          # Change this! (4-10 digits)
      - DUMBWISH_CURRENCY=USD    # Currency code (EUR, GBP, etc.)
    volumes:
      - ./data:/app/data
    restart: unless-stopped
```

Then run:
```bash
docker compose up -d
```

Access at http://localhost:3000

## Configuration

Environment variables:
- `DUMBDO_PIN`: PIN for admin access (4-10 digits, optional)
  - If not set, admin access will be unrestricted
  - Default: 1234 (change this!)
- `DUMBWISH_CURRENCY`: Currency code for prices
  - Use standard currency codes (USD, EUR, GBP, JPY, etc.)
  - Default: USD
  - Supported currencies: USD ($), EUR (€), GBP (£), JPY (¥), CNY (¥), 
    KRW (₩), INR (₹), RUB (₽), BRL (R$), AUD (A$), CAD (C$), 
    CHF (Fr), HKD (HK$), NZD (NZ$), SEK/NOK/DKK (kr), PLN (zł), 
    THB (฿), MXN ($)
- `DUMBWISH_TITLE`: Custom title for the application
  - Used in browser title and server logs
  - Default: DumbWish

## Development

To run locally without Docker:
```bash
npm install
DUMBDO_PIN=1234 DUMBWISH_CURRENCY=EUR npm start
```

## Data Storage

All wishlist items are stored in `data/wishlist.json`. The data directory is persisted through a Docker volume.

## Security Note

This app uses PIN authentication for admin access. Make sure to:
1. Change the default PIN in production
2. Use a secure PIN (avoid common sequences)
3. Keep your PIN private 
