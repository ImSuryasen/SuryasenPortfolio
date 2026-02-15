# LinkedIn Sync Backend

Small Express service that supports OAuth and profile sync for the portfolio experience section.

## Setup

1. `npm install`
2. Copy `.env.example` to `.env`
3. Fill:
   - `LINKEDIN_CLIENT_ID`
   - `LINKEDIN_CLIENT_SECRET`
   - `LINKEDIN_REDIRECT_URI`
   - `FRONTEND_ORIGIN`
4. `npm start`

Health endpoint:
- `GET /health`

OAuth endpoints:
- `GET /api/linkedin/auth-url`
- `POST /api/linkedin/sync`

## Notes

- The service tries LinkedIn profile and positions endpoints.
- Experience access may require additional LinkedIn permissions/approval.
- If positions are unavailable, frontend still supports manual JSON import and full inline editing.

## Required LinkedIn app permissions (manual)

These cannot be enabled from code. You must enable them in LinkedIn Developer Portal for your app:

1. Products tab:
   - Sign In with LinkedIn using OpenID Connect
   - Any additional partner product that explicitly allows member position/experience APIs (if available to your app)
2. Auth tab:
   - Add your exact redirect URL used by frontend
3. Scopes:
   - openid profile email
   - r_liteprofile r_emailaddress
   - w_member_social (optional, but commonly approved)

If your app does not have approved access to position endpoints, OAuth succeeds but experience list can still be empty.