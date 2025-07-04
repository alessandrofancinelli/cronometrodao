/**
 * This script acts as a web API for a stopwatch application,
 * recording session start/stop times in a Google Sheet and sending summary emails.
 *
 * To set up:
 * 1. Create a new Google Sheet (e.g., "Stopwatch Sessions").
 * 2. In the Google Sheet, go to Extensions > Apps Script.
 * 3. Replace the default code with the content of this file.
 * 4. Update the `SPREADSHEET_ID` and `SHEET_NAME` variables below.
 * 5. Deploy the script as a web app:
 *    - Click "Deploy" > "New deployment".
 *    - Select "Web app" as the type.
 *    - Set "Execute as" to "Me" (your Google account).
 *    - Set "Who has access" to "Anyone" (or "Anyone, even anonymous" if no authentication is needed).
 *    - Copy the "Web app URL" after deployment. This URL will be used in your frontend.
 * 6. Ensure the script has permissions to access Google Sheets and send emails.
 */

const SPREADSHEET_ID = 'YOUR_SPREADSHEET_ID_HERE'; // Replace with your Google Sheet ID
const SHEET_NAME = 'Sessions'; // Replace with your sheet name, e.g., 'Sheet1'

function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000); // Wait 30 seconds for the lock

  try {
    const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(SHEET_NAME);
    if (!sheet) {
      throw new Error(`Sheet '${SHEET_NAME}' not found.`);
    }

    const data = JSON.parse(e.postData.contents);
    const action = data.action;

    if (action === 'startSession') {
      return handleStartSession(sheet, data);
    } else if (action === 'stopSession') {
      return handleStopSession(sheet, data);
    } else {
      return createJsonResponse({ status: 'error', message: 'Invalid action' }, 400);
    }
  } catch (error) {
    return createJsonResponse({ status: 'error', message: error.message }, 500);
  } finally {
    lock.releaseLock();
  }
}

function handleStartSession(sheet, data) {
  const sessionId = data.sessionId;
  const startTime = new Date(); // Server-side timestamp for accuracy
  const nome = data.nome || '';
  const cognome = data.cognome || '';
  const userEmail = data.userEmail || '';

  // Check if session already exists (optional, depends on desired behavior)
  const range = sheet.getDataRange();
  const values = range.getValues();
  for (let i = 1; i < values.length; i++) { // Start from 1 to skip header row
    if (values[i][0] === sessionId && values[i][4] === '') { // SessionID matches and StopTime is empty (now column E)
      return createJsonResponse({ status: 'error', message: `Session ${sessionId} already active.` }, 409);
    }
  }

  // Append new row: SessionID, Nome, Cognome, StartTime, StopTime, Duration, UserEmail
  sheet.appendRow([sessionId, nome, cognome, startTime, '', '', userEmail]);
  return createJsonResponse({ status: 'success', message: 'Session started', sessionId: sessionId, startTime: startTime.toISOString() });
}

function handleStopSession(sheet, data) {
  const sessionId = data.sessionId;
  const stopTime = new Date(); // Server-side timestamp for accuracy
  let rowToUpdate = -1;
  let startTime = null;
  let userEmail = '';
  let nome = '';
  let cognome = '';

  const range = sheet.getDataRange();
  const values = range.getValues();

  // Find the row with the matching SessionID and empty StopTime
  for (let i = 1; i < values.length; i++) { // Start from 1 to skip header row
    if (values[i][0] === sessionId && values[i][4] === '') { // SessionID matches and StopTime is empty (now column E)
      rowToUpdate = i + 1; // Google Sheets row index is 1-based
      nome = values[i][1]; // Get nome from the sheet
      cognome = values[i][2]; // Get cognome from the sheet
      startTime = new Date(values[i][3]); // Get StartTime from the sheet (now column D)
      userEmail = values[i][6]; // Get user email from the sheet (now column G)
      break;
    }
  }

  if (rowToUpdate === -1) {
    return createJsonResponse({ status: 'error', message: `Active session for ${sessionId} not found.` }, 404);
  }

  const durationMs = stopTime.getTime() - startTime.getTime();
  const durationFormatted = formatDuration(durationMs);

  // Update the row: StopTime and Duration
  sheet.getRange(rowToUpdate, 5).setValue(stopTime); // Column E (5th column) for StopTime
  sheet.getRange(rowToUpdate, 6).setValue(durationFormatted); // Column F (6th column) for Duration

  // Send summary email
  if (userEmail) {
    sendSummaryEmail(userEmail, sessionId, nome, cognome, startTime, stopTime, durationFormatted);
  }

  return createJsonResponse({ status: 'success', message: 'Session stopped', sessionId: sessionId, stopTime: stopTime.toISOString(), duration: durationFormatted });
}

function formatDuration(milliseconds) {
  const totalSeconds = Math.floor(milliseconds / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

function sendSummaryEmail(recipient, sessionId, nome, cognome, startTime, stopTime, duration) {
  const subject = `Riepilogo Sessione Cronometro: ${sessionId}`;
  const body = `
    Gentile ${nome} ${cognome},

    La tua sessione di cronometro "${sessionId}" è terminata.

    Ora di Inizio: ${startTime.toLocaleString()}
    Ora di Fine: ${stopTime.toLocaleString()}
    Durata: ${duration}

    Grazie per aver utilizzato la nostra applicazione cronometro!
  `;

  try {
    MailApp.sendEmail(recipient, subject, body);
    Logger.log(`Summary email sent to ${recipient} for session ${sessionId}`);
  } catch (e) {
    Logger.log(`Failed to send email to ${recipient}: ${e.message}`);
  }
}

function createJsonResponse(data, status = 200) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON)
    .setStatusCode(status);
}

// Helper function to create the initial sheet headers if needed
function setupSheetHeaders() {
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(SHEET_NAME);
  if (sheet) {
    const headers = ['SessionID', 'Nome', 'Cognome', 'StartTime', 'StopTime', 'Duration', 'UserEmail'];
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  }
}
