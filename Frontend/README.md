# SLAMS Frontend (Member 1 — Frontend & UI)

Ye SLAMS project ka pura React frontend hai — Employee, Manager, aur HR Admin ke
teeno dashboards ke saath. Abhi ye **mock data** pe chal raha hai, taaki tum aur
poori team turant test kar sako, bina backend ka wait kiye.

## 1. System pe install karo (ek baar hi)

1. Node.js install karo: https://nodejs.org (LTS version lo)
2. Check karo terminal mein:
   ```
   node -v
   npm -v
   ```

## 2. Project run karo (local pe dekhne ke liye)

Project folder khol ke terminal mein:

```bash
npm install
npm run dev
```

Terminal mein ek link aayega jaise `http://localhost:5173` — wo browser mein
kholo. Login screen dikhega. Role dropdown se "Employee" / "Manager" / "HR Admin"
choose karke sign in karo, teeno dashboards test kar sakte ho.

## 3. Folder structure samajh lo

```
src/
  api/mockApi.js        <- Saara "backend" abhi yahi hai (mock). Real API aane
                            par sirf ye file change hogi, baaki UI code nahi.
  context/AuthContext.jsx <- Login/role state
  components/            <- Chhote reusable pieces (form, table, calendar, etc.)
  pages/
    Login.jsx
    EmployeeDashboard.jsx
    ManagerDashboard.jsx
    HRDashboard.jsx
  App.jsx                <- Routing (kaunsa role kaunsa page dekhega)
```

## 4. Team ke sath integration (important!)

`src/api/mockApi.js` mein har function ka naam Technical Doc ke Section 8
(API Design) ke endpoint se match karta hai:

| Function (frontend)     | Real endpoint (backend)                  | Kaun banayega |
|--------------------------|-------------------------------------------|---------------|
| `getBalances()`          | `GET /balances/{employee_id}`             | Chiranthan / Prasanna |
| `getLeaveHistory()`      | `GET /leave-requests/{employee_id}`       | Prasanna |
| `submitLeaveRequest()`   | `POST /leave-requests`                    | Prasanna |
| `cancelLeaveRequest()`   | `POST /leave-requests/{id}/cancel`        | Prasanna |
| `getPendingApprovals()`  | `GET /approvals/pending`                  | Prasanna |
| `approveRequest()` / `rejectRequest()` | `GET /approve` / `GET /reject` | Prasanna |
| `getCalendar()`          | `GET /calendar`                           | Chiranthan / Prasanna |
| `getLeaveConfig()` / `updateLeaveConfig()` | `GET`/`PUT /config/leave-types` | HR Admin route |
| `downloadReportCsv()`    | `GET /reports/leave-summary`              | Chiranthan / Prasanna |

**Jab Member 2 (Sasikumar) API Gateway + Cognito ready kar de:**
1. `mockApi.js` ke top pe `BASE_URL` ko real API Gateway invoke URL se replace karo
2. Har function ke andar `await delay()` + mock logic hata ke `fetch(BASE_URL + '/route', ...)` daal do
3. `AuthContext.jsx` mein mock `login()` ko Cognito hosted UI / Amplify Auth se replace karo
4. **Baki UI code (components/pages) bilkul touch nahi karna padega** — kyunki
   function names aur return shapes same rakhe hain.

Ye bhai teammates ko bhi bata dena — unhe pata chal jayega ki unki Lambda ka
input/output kaisa hona chahiye, kyunki mock functions mein wahi shape hai.

## 5. Production build banao

```bash
npm run build
```

Isse `dist/` folder banega — yahi actual files hain jo S3 pe jayengi.

## 6. Amazon S3 pe deploy karo (Static Website Hosting)

1. AWS Console → S3 → "Create bucket". Naam kuch bhi (globally unique), e.g.
   `slams-frontend-f13`. Region: apni team ki AWS region.
2. Bucket → **Permissions** tab → "Block public access" ko **uncheck/off** karo
   (static site public honi chahiye) → save.
3. Bucket → **Properties** tab → neeche scroll karo → "Static website hosting"
   → Enable → Index document: `index.html` → Error document: `index.html`
   (SPA routing ke liye zaroori — warna refresh pe 404 aayega).
4. Bucket → **Permissions** → Bucket Policy mein ye daalo (bucket-name apna
   daalna):
   ```json
   {
     "Version": "2012-10-17",
     "Statement": [
       {
         "Sid": "PublicReadGetObject",
         "Effect": "Allow",
         "Principal": "*",
         "Action": "s3:GetObject",
         "Resource": "arn:aws:s3:::slams-frontend-f13/*"
       }
     ]
   }
   ```
5. `dist/` folder ke andar ki saari files upload karo (folder khud nahi,
   uske andar wali files/folders — `index.html`, `assets/` etc.)
6. Properties tab mein "Bucket website endpoint" wala URL milega — wahi
   tumhara live link hai, team ke saath share kar do.

Baad mein CloudFront (HTTPS ke liye) laga sakte ho — abhi ke liye ye
S3 static hosting kaafi hai jaisa doc mein bhi likha hai (Section 9.3).

## 7. Agla step

- Login karke teeno roles test karo (Employee / Manager / HR Admin)
- Screenshots le ke team group mein daal do ki "frontend UI ready hai"
- Sasikumar/Virajith isse dekh ke pata karenge ki API kaisi banani hai
- Jab real API mile, sirf `mockApi.js` update karna hai (Section 4 dekho)
