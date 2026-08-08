import {
  convexAuthNextjsMiddleware,
  createRouteMatcher,
  nextjsMiddlewareRedirect,
} from "@convex-dev/auth/nextjs/server"

const isSignedInRoute = createRouteMatcher(["/dashboard(.*)", "/join(.*)"])
const isAuthPage = createRouteMatcher(["/login", "/signup", "/forgot-password"])

export default convexAuthNextjsMiddleware(async (request, { convexAuth }) => {
  const authenticated = await convexAuth.isAuthenticated()

  if (isSignedInRoute(request) && !authenticated) {
    // Preserve where they were headed so sign-in can return them there.
    const target = request.nextUrl.pathname + request.nextUrl.search
    const redirect = new URL("/login", request.url)
    if (target !== "/dashboard") redirect.searchParams.set("next", target)
    return nextjsMiddlewareRedirect(request, redirect.pathname + redirect.search)
  }

  if (isAuthPage(request) && authenticated) {
    return nextjsMiddlewareRedirect(request, "/dashboard")
  }
})

export const config = {
  matcher: ["/((?!.*\\..*|_next).*)", "/", "/(api|trpc)(.*)"],
}
