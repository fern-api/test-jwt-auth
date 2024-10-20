import { SignJWT } from "jose";
import { NextRequest, NextResponse } from "next/server";

// Please reach out to the Fern Team if you have any questions about this setup.
// In this example, we show how you can write a lambda handler (or cloudflare worker) can be setup after the user logs in via your identity provider
// and mint a JWT (which we refer to as the `fern_token`) which will give users access to VIEW your docs.

// your domain
const JWT_ISSUER = "https://yourdomain.com"

// this is the domain of your docs, (or, if subpathed, use the apex here: yourdomain.com);
const DOCS_ORIGIN = "https://docs.yourdomain.com";

// this is path that you will redirect to in the docs instance, and let Fern set the fern_token. This is preferred.
// alternatively, you may opt to set the `Set-Cookie` header directly using `fern_token` (case sensitive) if on the same domain.
// if subpathed docs, be sure to include the subpath set by your proxy, i.e. `/docs/api/fern-docs/auth/jwt/callback`.
const JWT_CALLBACK_PATHNAME = "/api/fern-docs/auth/jwt/callback";

// JWT payload must include a `fern` key. All fields are optional:
interface FernUser {
  apiKey?: string; // api key injection into the runnable API Playground
  audience?: string[]; // ACLs -> this controls which part of the docs are visible to the user
}

// this is the symmetric secret key that will be provided by Fern:
function getJwtTokenSecret(): Uint8Array {
  if (!process.env.JWT_TOKEN_SECRET) {
    throw new Error("JWT_TOKEN_SECRET is not set");
  }
  return new TextEncoder().encode(process.env.JWT_TOKEN_SECRET);
}

function signFernJWT(fern: FernUser): Promise<string> {
  return new SignJWT({ fern })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuedAt()
    // be sure to set an appropriate expiration duration based on the level of sensitivity (i.e. api key) contained within the token, and the access that the token confers
    .setExpirationTime("30d")
    .setIssuer(JWT_ISSUER)
    .sign(getJwtTokenSecret());
}

// After the user has either signed up or logged in, they will be redirected back to a `/callback` url.
// This is where you will mint a session token for
export async function GET(req: NextRequest): Promise<NextResponse> {
  const url = new URL(JWT_CALLBACK_PATHNAME, DOCS_ORIGIN);

  // preserve the state
  const state = req.nextUrl.searchParams.get("state");
  if (state) {
    url.searchParams.set("state", state);
  }

  const fern_token = await signFernJWT({
    // audience?: [] <-- set audience filters here
  });

  // send the fern_token to fern docs as a query parameter (please be sure that this is over HTTPS)
  url.searchParams.set("fern_token", fern_token);

  // this will redirect to the callback url in fern docs, which will set the cookie to the "docs.yourdomain.com" domain.
  // after which, the callback url will redirect the user to the homepage, or return to the URL contained in the state query parameter.
  const response = NextResponse.redirect(url);

  // if you've minted your own cookie for your own platform, you can set it here too:
  // response.cookies.set("access_token", mintAccessToken(req));
  // response.cookies.set("refresh_token", mintRefreshToken(req));
  
  return response;
}
