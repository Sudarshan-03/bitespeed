# Identity Reconciliation API Test Payloads

Here is a structured sequence of JSON payloads you can use in Postman, Thunder Client, or cURL to test every edge case of the `/identify` endpoint. 

The API is running locally at `http://localhost:3000/identify`.

## Scenario 1: New Contact (Rule A)
**Action:** Create a brand new primary contact since no info matches.

**JSON Payload:**
```json
{
  "email": "lorraine@hillvalley.edu",
  "phoneNumber": "123456"
}
```

**Expected Result:** A new `primary` contact is created.

---

## Scenario 2: Create Secondary (Rule B)
**Action:** Send a request with a matching email, but a **new** phone number.

**JSON Payload:**
```json
{
  "email": "lorraine@hillvalley.edu",
  "phoneNumber": "1234567"
}
```

**Expected Result:** A new `secondary` contact is created and linked to the primary contact from Scenario 1. The payload returns both phone numbers.

---

## Scenario 3: Another New Primary (Rule A)
**Action:** Create another completely separate new contact.

**JSON Payload:**
```json
{
  "email": "mcfly@hillvalley.edu",
  "phoneNumber": "71192"
}
```

**Expected Result:** A new `primary` contact is created, completely separate from the previous cluster.

---

## Scenario 4: Merge Primaries (Rule C)
**Action:** Send a request containing the email from Scenario 1, but the phone number from Scenario 3.

**JSON Payload:**
```json
{
  "email": "lorraine@hillvalley.edu",
  "phoneNumber": "71192"
}
```

**Expected Result:** No new contacts are created. Instead, the primary contact from Scenario 3 is turned into a `secondary` contact and linked to the older primary contact from Scenario 1. The returned payload will consolidate all emails and phone numbers from the entire newly-merged cluster.

---

## Scenario 5: Missing Data
**Action:** Send a request with only an email and no phone number.

**JSON Payload:**
```json
{
  "email": "mcfly@hillvalley.edu"
}
```

**Expected Result:** Returns the consolidated cluster payload matching the email without creating any new records.

---

## Scenario 6: Validation Error
**Action:** Send an empty request body.

**JSON Payload:**
```json
{}
```

**Expected Result:** A `400 Bad Request` status with an error message stating "At least one of email or phoneNumber is required".
