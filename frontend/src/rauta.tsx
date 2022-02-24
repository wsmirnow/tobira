import React, { useEffect, useRef, useState, useTransition } from "react";

import { bug } from "./util/err";


/** A single route. You probably want to use `makeRoute` to create this. */
export type Route = {
    /**
     * Checks if this route matches with the given URL. If it does, this
     * function may prepare the route and then has to return a `MatchedRoute`.
     * If the URL doesn't match this route, `null` should be returned.
     */
    match: (url: URL) => MatchedRoute | null;
};

/** A route used as fallback (if no other route matches) */
export type FallbackRoute = {
    /** Similar to `Route.match`, but without the option to return null. */
    prepare: (url: URL) => MatchedRoute;
};

/**
 * A route that has been successfully matched against an URL and has been
 * prepared. It can now be rendered.
 */
export type MatchedRoute = {
    /** Called during React rendering phase. */
    render: () => JSX.Element;

    /** Called once the route is no longer active. Can be used for cleanup. */
    dispose?: () => void;
};

/** Creates the internal representation of the given route. */
export const makeRoute = (match: (url: URL) => MatchedRoute | null): Route => ({ match });

/** Routing definition */
interface Config {
    /** The fallback route. Used when no routes in `routes` match. */
    fallback: FallbackRoute;

    /** All routes. They are matched in order, with the first matching one "winning". */
    routes: Route[];

    /** If set to `true`, debug messages are logged via `console.debug`. Default: `false`. */
    debug?: boolean;
}

/** Props of the `<Link>` component. */
type LinkProps = {
    to: string;
} & Omit<React.ComponentPropsWithoutRef<"a">, "href">;

/** Props of the `<Router>` component. */
type RouterProps = {
    initialRoute: MatchedRoute;
    children: JSX.Element;
};

export type RouterLib = {
    /**
     * Matches the given full href against all routes, returning the first
     * matched route or throwing an error if no route matches.
     */
    matchRoute: (href: string) => MatchedRoute;

    /**
     * Like `matchRoute(window.location.href)`. Intended to be called before
     * `React.render` to obtain the initial route for the application.
     */
    matchInitialRoute: () => MatchedRoute;

    /** Hook to obtain a reference to the router. */
    useRouter: () => RouterControl;

    /**
     * An internal link, using the defined routes. Should be used instead of
     * `<a>`. Has to be mounted below a `<Router>`!
     *
     * This component reacts to clicks and prevents any default action (e.g. the
     * browser navigating to that link). Instead, our router is notified of the new
     * route and renders appropriately.
     */
    Link: (props: LinkProps) => JSX.Element;

    /**
     * Renders the currently matched route. Has to be used somewhere inside of a
     * `<Router>`.
     */
    ActiveRoute: () => JSX.Element;

    /** Provides the required context for `<Link>` and `<ActiveRoute>` components. */
    Router: (props: RouterProps) => JSX.Element;
};

/** Helper class: a list of listeners */
class Listeners<F extends (...args: any) => any> {
    public list: { listener: F }[] = [];

    /** Adds a new listener. Returns function to remove that listener again. */
    public add(listener: F): () => void {
        const obj = { listener };
        this.list.push(obj);
        return () => {
            this.list = this.list.filter(l => l !== obj);
        };
    }

    /** Call all listeners with the same arguments. */
    public callAll(args: Parameters<F>) {
        for (const { listener } of this.list) {
            listener(args);
        }
    }
}

export type AtNavListener = () => void;
export type BeforeNavListener = (preventNavigation: () => void) => void;

/** Obtained via `useRouter`, allowing you to perform some routing-related actions. */
export interface RouterControl {
    /** Navigates to a new URI, just like creating a `<Link to={uri}>` and clicking it. */
    goto(uri: string): void;

    /**
     * Like `history.pushState` (with fewer arguments): pushes a new history
     * entry, but does NOT trigger rendering the correct route. So you rarely
     * want this! Use `goto` instead.
     */
    push(uri: string): void;

    /**
     * Like `history.replaceState` (with fewer arguments): replaces the URL of
     * the current history entry. Does NOT cause the router to render the
     * appropriate route.
     */
    replace(uri: string): void;

    /**
     * Adds a listener function that is called whenever a route transition is
     * about to be performed. Neither the location nor the matched route has to
     * change: the listener is also called when a navigation to the current
     * location is initiated.
     *
     * Returns a function that removes the listener. Call the function at an
     * appropriate time to prevent memory leaks.
     */
    listenAtNav(listener: AtNavListener): () => void;

    /**
     * Like `listenAtNav`, but is called *before* the navigation is performed.
     * Each listener has the ability to prevent navigation by calling the
     * passed function.
     */
    listenBeforeNav(listener: BeforeNavListener): () => void;

    /**
     * Indicates whether we are currently transitioning to a new route. Intended
     * to show a loading indicator.
     */
    isTransitioning: boolean;
}

export const makeRouter = <C extends Config, >(config: C): RouterLib => {
    // Helper to log debug messages if `config.debug` is true.
    const debugLog = (...args: any[]) => {
        if (config.debug) {
            // eslint-disable-next-line no-console
            console.debug("[rauta] ", ...args);
        }
    };

    /** What rauta stores in the history state */
    type _State = {
        /** The last scroll position of the route */
        scrollY: number;
        /** An increasing number. Is used to undo popstate events. */
        index: number;
    };

    // We maintain an index in a variable here to know the "previous index" when
    // we are reacting to "onPopState" events.
    let currentIndex = 0;

    // If the page is first loaded, we want to correctly set the state.
    if (window.history.state?.index == null) {
        window.history.replaceState({ index: 0, scrollY: window.scrollY }, "");
    }

    /** Wrapper for `history.pushState` */
    const push = (url: string) => {
        const index = currentIndex + 1;
        window.history.pushState({ scrollY: 0, index }, "", url);
        currentIndex = index;
    };

    /** Wrapper for `history.replaceState`. If `url` is `null`, it is not changed. */
    const replace = (url: string | null, scrollY: number) => {
        const state = {
            scrollY,
            index: currentIndex,
        };
        window.history.replaceState(state, "", url ?? undefined);
    };


    const shouldPreventNav = (listeners: Listeners<BeforeNavListener>): boolean => {
        for (const { listener } of listeners.list) {
            let prevent = false;
            listener(() => prevent = true);
            if (prevent) {
                return true;
            }
        }

        return false;
    };

    const useRouterImpl = (caller: string): RouterControl => {
        const context = React.useContext(Context);
        if (context === null) {
            return bug(`${caller} used without a parent <Router>! That's not allowed.`);
        }

        return {
            isTransitioning: context.isTransitioning,
            push: (url: string) => push(url),
            replace: (url: string) => replace(url, window.scrollY),
            listenAtNav: (listener: AtNavListener) =>
                context.listeners.atNav.add(listener),
            listenBeforeNav: (listener: BeforeNavListener) =>
                context.listeners.beforeNav.add(listener),
            goto: (uri: string): void => {
                if (shouldPreventNav(context.listeners.beforeNav)) {
                    return;
                }

                const href = new URL(uri, document.baseURI).href;
                const newRoute = matchRoute(href);

                // When navigating to new routes, the scroll position always
                // starts as 0 (i.e. the very top).
                context.setActiveRoute({ route: newRoute, initialScroll: 0 });
                push(href);

                debugLog(`Setting active route for '${href}' (index ${currentIndex}) `
                    + "to: ", newRoute);
            },
        };
    };

    const Link = ({ to, children, onClick, ...props }: LinkProps) => {
        const router = useRouterImpl("<Link>");

        const handleClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
            // We only want to react to simple mouse clicks.
            if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey || e.button !== 0) {
                return;
            }

            e.preventDefault();
            router.goto(to);

            // If the caller specified a handler, we will call it as well.
            if (onClick) {
                onClick(e);
            }
        };

        return <a href={to} onClick={handleClick} {...props}>{children}</a>;
    };

    const matchRoute = (href: string): MatchedRoute => {
        const url = new URL(href);
        for (const route of config.routes) {
            const matched: MatchedRoute | null = route.match(url);

            if (matched !== null) {
                return matched;
            }
        }

        return config.fallback.prepare(url);
    };

    const matchInitialRoute = (): MatchedRoute => matchRoute(window.location.href);

    type ActiveRoute = {
        route: MatchedRoute;

        /** A scroll position that should be restored when the route is first rendered */
        initialScroll: number | null;
    };

    type ContextData = {
        activeRoute: ActiveRoute;
        setActiveRoute: (newRoute: ActiveRoute) => void;
        listeners: {
            atNav: Listeners<AtNavListener>;
            beforeNav: Listeners<BeforeNavListener>;
        };
        isTransitioning: boolean;
    };

    const Context = React.createContext<ContextData | null>(null);

    const useRouter = (): RouterControl => useRouterImpl("`useRouter`");

    /** Provides the required context for `<Link>` and `<ActiveRoute>` components. */
    const Router = ({ initialRoute, children }: RouterProps) => {
        const listeners = useRef<ContextData["listeners"]>({
            atNav: new Listeners(),
            beforeNav: new Listeners(),
        });
        const [activeRoute, setActiveRouteRaw] = useState<ActiveRoute>({
            route: initialRoute,
            initialScroll: null, // We do not want to restore any scroll position
        });
        const [isPending, startTransition] = useTransition();

        const setActiveRoute = (newRoute: ActiveRoute) => {
            startTransition(() => {
                setActiveRouteRaw(() => newRoute);
                listeners.current.atNav.callAll([]);
            });
        };

        // Register some event listeners and set global values.
        useEffect(() => {
            // Whenever the user navigates forwards or backwards in the browser,
            // we have to render the corresponding route. We also restore the
            // scroll position which we store within the history state.
            // Finally, this is used to prevent navigating away from a route if
            // this is blocked.
            let ignoreNextPop = false;
            const onPopState = (e: PopStateEvent) => {
                if (ignoreNextPop) {
                    ignoreNextPop = false;
                    return;
                }

                const newIndexRaw = e.state?.index;
                const newIndex = typeof newIndexRaw === "number" ? newIndexRaw : null;
                debugLog(`Handling popstate event to '${window.location.href}' `
                    + `(indices ${currentIndex} -> ${newIndex})`);
                if (shouldPreventNav(listeners.current.beforeNav)) {
                    // We want to prevent the browser from going backwards or forwards.
                    // Unfortunately, `e.preventDefault()` does nothing as the event is not
                    // cancelable. So we can only undo the change, at least most of the time.
                    if (newIndex != null) {
                        // The state that was transitioned to was controlled by us (this will
                        // be the case most of the time). We ignore a delta of 0
                        const delta = currentIndex - newIndex;
                        debugLog(`Undoing popstate event via go(${delta})`);
                        ignoreNextPop = true;
                        window.history.go(delta);
                        return;
                    } else {
                        // There was no index stored in the state. This should almost never happen,
                        // except if other JS code here uses the `history` API directly. If the
                        // forward/backward buttons direct to a non-Tobira site, the "popstate"
                        // event is not fired, but the onbeforeunload is triggered.
                        //
                        // If this happens, we do not `return` and actually render the correct
                        // route. Otherwise we have a strange inconsistent app state.
                        debugLog("Can't undo popstate event :-(");
                    }
                }

                currentIndex = newIndex ?? 0;

                const newRoute = matchRoute(window.location.href);
                setActiveRoute({ route: newRoute, initialScroll: e.state?.scrollY });
                debugLog(
                    "Reacting to 'popstate' event: setting active route for"
                        + `'${window.location.href}' to: `,
                    newRoute,
                );
            };

            // To actually get the correct scroll position into the history state, we
            // unfortunately need to listen for scroll events. They can fire at a high
            // rate, but `replaceState` is really fast to call. On jsbench.me the line
            // could be executed 1 million times per second. And scroll events are usually
            // not fired faster than `requestAnimationFrame`. So this should be fine!
            const onScroll = () => {
                replace(null, window.scrollY);
            };

            // To prevent the browser restoring any scroll position.
            history.scrollRestoration = "manual";

            window.addEventListener("popstate", onPopState);
            window.addEventListener("scroll", onScroll);
            return () => {
                window.removeEventListener("popstate", onPopState);
                window.removeEventListener("scroll", onScroll);
            };
        }, []);

        // Dispose of routes when they are no longer needed.
        useEffect(() => () => {
            if (activeRoute.route.dispose) {
                debugLog("Disposing of route: ", activeRoute);
                activeRoute.route.dispose();
            }
        }, [activeRoute]);

        const contextData = {
            setActiveRoute,
            activeRoute,
            listeners: listeners.current,
            isTransitioning: isPending,
        };

        return <Context.Provider value={contextData}>{children}</Context.Provider>;
    };

    const ActiveRoute = () => {
        const context = React.useContext(Context);
        if (context === null) {
            throw new Error("<ActiveRoute> used without a parent <Router>! That's not allowed.");
        }

        useEffect(() => {
            const scroll = context.activeRoute.initialScroll;
            if (scroll != null) {
                debugLog("Restoring scroll position to: ", scroll);
                window.scrollTo(0, scroll);
            }
        }, [context.activeRoute]);

        return context.activeRoute.route.render();
    };

    return {
        Link,
        matchRoute,
        matchInitialRoute,
        useRouter,
        ActiveRoute,
        Router,
    };
};

