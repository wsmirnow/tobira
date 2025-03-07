import { useEffect, useRef } from "react";
import { Config, Manifest, Paella, Source, Stream } from "paella-core";
import getBasicPluginsContext from "paella-basic-plugins";
import getZoomPluginContext from "paella-zoom-plugin";

import { Caption, isHlsTrack, Track } from ".";
import { SPEEDS } from "./consts";
import { useTranslation } from "react-i18next";


// Paella currently can't handle audio tracks
type VideoTrack = Track & { resolution: NonNullable<Track["resolution"]> };

type PaellaPlayerProps = {
    title: string;
    duration: number;
    tracks: readonly Track[];
    captions: readonly Caption[];
    isLive: boolean;
};

const PaellaPlayer: React.FC<PaellaPlayerProps> = ({
    tracks, title, duration, isLive, captions,
}) => {
    const { t } = useTranslation();
    const ref = useRef<HTMLDivElement>(null);
    const paella = useRef<Paella>();

    useEffect(() => {
        // If the ref is not set yet (which should not usually happen), we do
        // nothing.
        if (!ref.current) {
            return;
        }

        // Otherwise we check weather Paella is already initialized. If not, we
        // do that now and set the initialized instance to `ref.current.paella`.
        if (!paella.current) {
            // Video/event specific information we have to give to Paella.
            const tracksByKind: Record<string, VideoTrack[]> = {};
            const videoTracks = tracks.filter((t): t is VideoTrack => !!t.resolution);
            for (const track of videoTracks) {
                const kind = track.flavor.split("/")[0];
                if (!(kind in tracksByKind)) {
                    tracksByKind[kind] = [];
                }
                tracksByKind[kind].push(track);
            }

            const manifest: Manifest = {
                metadata: { title, duration },
                streams: Object.entries(tracksByKind).map(([key, tracks]) => ({
                    content: key,
                    sources: tracksToPaellaSources(tracks, isLive),
                })),
                captions: captions.map(({ uri, lang }, index) => ({
                    format: "vtt",
                    url: uri,
                    lang: lang ?? undefined,
                    // We try to come up with usable labels for the tracks. This should be
                    // improved in the future, hopefully by getting better information.
                    text: t("video.caption")
                        + (lang ? ` (${lang})` : "")
                        + (captions.length > 1 ? ` [${index + 1}]` : ""),
                })),
            };

            // If there are no presenter tracks (and there is more than one
            // stream), Paella needs us to tell it which stream should function
            // as the main audio source. We don't know either, so we pick one
            // at random.
            if (manifest.streams.length > 1 && !("presenter" in tracksByKind)) {
                // eslint-disable-next-line no-console
                console.warn("Picking first stream as main audio source. Tracks: ", videoTracks);
                manifest.streams[0].role = "mainAudio";
            }

            paella.current = new Paella(ref.current, {
                // Paella has a weird API unfortunately. It by default loads two
                // files via `fetch`. But we can provide that data immediately
                // since we just derive it from our GraphQL data. So we
                // override all functions (which Paella luckily allows) to do
                // nothing except immediately return the data.
                loadConfig: async () => PAELLA_CONFIG as Config,
                getVideoId: async () => "dummy-id",
                getManifestUrl: async () => "dummy-url",
                getManifestFileUrl: async () => "dummy-file-url",
                loadVideoManifest: async () => manifest,
                customPluginContext: [
                    getBasicPluginsContext(),
                    getZoomPluginContext(),
                ],
            });
            paella.current.loadManifest();
        }

        const paellaSnapshot = paella.current;
        return () => {
            paellaSnapshot.unload();
            paella.current = undefined;
        };
    }, [tracks, title, duration, isLive, captions, t]);

    return (
        <div
            // We use `key` here to force React to re-create this `div` and not
            // reuse the old one. This is useful as Paella's cleanup function
            // sometimes does not clean everything. We can (and should) always
            // report those bugs and then update Paella, but this way we avoid
            // all these problems. And re-rendering the div is really not
            // problematic as it doesn't have many children.
            key={title}
            ref={ref}
            css={{
                height: "100%",
                overflow: "hidden",
                margin: "auto",

                // Override stuff that Paella applies
                left: "unset",
                top: "unset",
                fontFamily: "unset",
            }}
        />
    );
};

const PAELLA_CONFIG = {
    logLevel: "WARN",

    plugins: {
        "es.upv.paella.singleVideo": {
            enabled: true,
            validContent: [
                {
                    id: "presenter",
                    content: ["presenter"],
                    icon: "present-mode-2.svg",
                    title: "Presenter",
                },
                {
                    id: "presentation",
                    content: ["presentation"],
                    icon: "present-mode-1.svg",
                    title: "Presentation",
                },
                {
                    id: "presenter-2",
                    content: ["presenter-2"],
                    icon: "present-mode-1.svg",
                    title: "Presentation",
                },
            ],
        },
        "es.upv.paella.dualVideo": {
            enabled: true,
            validContent: [
                {
                    id: "presenter-presentation",
                    content: ["presenter", "presentation"],
                    icon: "present-mode-3.svg",
                    title: "Presenter and presentation",
                },
                {
                    id: "presenter-2-presentation",
                    content: ["presenter-2", "presentation"],
                    icon: "present-mode-3.svg",
                    title: "Presenter and presentation",
                },
                {
                    id: "presenter-presenter-2",
                    content: ["presenter", "presenter-2"],
                    icon: "present-mode-3.svg",
                    title: "Presenter and presentation",
                },
            ],
        },

        // Canvas plugins
        "es.upv.paella.videoCanvas": {
            enabled: true,
            order: 1,
        },
        "es.upv.paella.zoomPlugin": {
            enabled: true,
            order: 0,
        },

        // Format plugins
        "es.upv.paella.mp4VideoFormat": {
            enabled: true,
            order: 1,
        },
        "es.upv.paella.hlsVideoFormat": {
            "enabled": true,
            "order": 0,
            "corsConfig": {
                "withCredentials": false,
                "requestHeaders": {
                    "Access-Control-Allow-Credentials": false,
                },
            },
        },
        "es.upv.paella.hlsLiveVideoFormat": {
            "enabled": true,
            "order": 0,
            "corsConfig": {
                "withCredentials": false,
                "requestHeaders": {
                    "Access-Control-Allow-Credentials": false,
                },
            },
        },
        "es.upv.paella.vttManifestCaptionsPlugin": {
            enabled: true,
        },

        // Buttons on the left side
        "es.upv.paella.playPauseButton": {
            enabled: true,
            side: "left",
        },
        "es.upv.paella.volumeButtonPlugin": {
            enabled: true,
            side: "left",
        },
        "es.upv.paella.forwardButtonPlugin": {
            "enabled": true,
            "side": "left",
        },
        "es.upv.paella.backwardButtonPlugin": {
            "enabled": true,
            "side": "left",
        },

        // Buttons on the right side
        "es.upv.paella.captionsSelectorPlugin": {
            enabled: true,
            side: "right",
        },
        "es.upv.paella.playbackRateButton": {
            enabled: true,
            side: "right",
            rates: SPEEDS,
        },
        "es.upv.paella.qualitySelector": {
            enabled: true,
            side: "right",
        },
        "es.upv.paella.fullscreenButton": {
            enabled: true,
            side: "right",
        },
    },
};

const tracksToPaellaSources = (tracks: VideoTrack[], isLive: boolean): Stream["sources"] => {
    const trackToSource = (t: VideoTrack): Source => {
        const [w, h] = t.resolution;
        return {
            src: t.uri,
            // TODO: what to do if `t.mimetype` is not mp4 or not specified?
            mimetype: "video/mp4" as const,
            res: { w, h },
        };
    };

    const hlsTracks = tracks.filter(isHlsTrack)
        // Make sure a/the master playlist is in front, so that quality selection works
        .sort((a, b) => Number(b.isMaster) - Number(a.isMaster));
    const mp4Tracks = tracks.filter(t => !isHlsTrack(t));

    const hlsKey = isLive ? "hlsLive" : "hls";

    return {
        ...mp4Tracks.length > 0 && { "mp4": mp4Tracks.map(trackToSource) },
        ...hlsTracks.length > 0 && { [hlsKey]: hlsTracks.map(trackToSource) },
    };
};

export default PaellaPlayer;
