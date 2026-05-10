# Bug Fix: Preview Shows Synced Hosts But Sync Skips Them All

## Problem

User reported that Preview tab showed 29 hosts would be synced, but when running the actual sync, it synced 0 hosts and skipped all 29.

## Root Cause

The sync endpoint in `src/server.js` was using:
```javascript
checkSSH: req.body.checkSSH !== false,
```

This meant when `req.body.checkSSH` was `undefined` (frontend not sending it), it defaulted to `true` - forcing SSH checks even if the config had it disabled.

Meanwhile, the Preview endpoint used:
```javascript
const checkSSH = req.query.checkSSH !== 'false';
```

But the frontend wasn't sending this parameter, so it also defaulted to checking SSH config from the stored settings.

**The issue**: The frontend was sending an empty request body `{}` to the sync endpoint, causing `checkSSH` to default to `true` regardless of user configuration. If SSH checks were disabled in config, the preview would show hosts, but sync would skip them because SSH wasn't responding.

## Solution

Updated [public/app.js](public/app.js) to:

1. **Load config before sync**: Fetch the config to get the actual `checkSSH` setting
2. **Send config to sync endpoint**: Pass `checkSSH: config.sync.checkSSH` in the request body
3. **Added live console to Preview**: User also requested live console logging for the preview button

### Changes Made

**File: public/app.js**

**Sync Now Button (Line 298-332)**:
- Added config fetch before sync
- Sends `checkSSH` value from config to sync endpoint
- Now respects user's SSH check setting

**Load Preview Button (Line 369-480)**:
- Added live console overlay
- Shows real-time progress with logging
- Displays SSH check results in logs

## Testing

1. With SSH check **enabled**: Preview and sync should both check SSH and sync only available hosts
2. With SSH check **disabled**: Both preview and sync should ignore SSH status and sync all hosts with IPs

## Files Modified

- `public/app.js` - Frontend sync and preview handlers
