import { useState } from "react";
import { useTranslation } from "react-i18next";
import { FiAlertTriangle, FiFilm, FiRadio, FiVolume2 } from "react-icons/fi";
import { HiOutlineUserCircle } from "react-icons/hi";


type ThumbnailProps = JSX.IntrinsicElements["div"] & {
    /** The event of which a thumbnail should be shown */
    event: {
        title: string;
        isLive: boolean;
        created: string;
        syncedData: {
            duration: number;
            thumbnail: string | null;
            startTime: string | null;
            endTime: string | null;
        } & (
            {
                tracks: readonly { resolution: readonly number[] | null }[];
            } | {
                audioOnly: boolean;
            }
        ) | null;
    };

    /** If `true`, an indicator overlay is shown */
    active?: boolean;
};

export const Thumbnail: React.FC<ThumbnailProps> = ({
    event,
    active = false,
    ...rest
}) => {
    const { t } = useTranslation();
    const audioOnly = event.syncedData
        ? (
            "audioOnly" in event.syncedData
                ? event.syncedData.audioOnly
                : event.syncedData.tracks.every(t => t.resolution == null)
        )
        : false;

    let inner;
    if (event.syncedData?.thumbnail != null) {
        // We have a proper thumbnail.
        inner = <ThumbnailImg
            src={event.syncedData.thumbnail}
            alt={t("video.thumbnail-for", { video: event.title })}
        />;
    } else {
        // We have no thumbnail. If the resolution is `null` as well, we are
        // dealing with an audio-only event and show an appropriate icon.
        // Otherwise we use a generic icon.
        const icon = audioOnly ? <FiVolume2 /> : <FiFilm />;

        inner = (
            <div css={{
                display: "flex",
                height: "100%",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 40,
                background: "linear-gradient(135deg, #33333380 50%, transparent 0),"
                    + "linear-gradient(-135deg, #33333380 50%, transparent 0)",
                backgroundSize: "17px 17px",
                color: "var(--grey86)",
                backgroundColor: "#292929",
            }}>{icon}</div>
        );
    }

    const overlayBaseCss = {
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        position: "absolute",
        right: 6,
        bottom: 6,
        borderRadius: 4,
        padding: "1px 5px",
        fontSize: 14,
        backgroundColor: "hsla(0, 0%, 0%, 0.75)",
        color: "white",
    } as const;
    let overlay;
    if (event.isLive) {
        // TODO: we might want to have a better "is currently live" detection.
        const now = new Date();
        const startTime = new Date(event.syncedData?.startTime ?? event.created);
        const endTime = event.syncedData?.endTime;
        const hasEnded = endTime == null ? null : new Date(endTime) < now;
        const hasStarted = startTime < now;
        const currentlyLive = hasStarted && !hasEnded;

        let innerOverlay;
        if (hasEnded) {
            innerOverlay = t("video.ended");
        } else if (hasStarted) {
            innerOverlay = <>
                <FiRadio css={{ fontSize: 19, strokeWidth: 1.4 }} />
                {t("video.live")}
            </>;
        } else {
            innerOverlay = t("video.upcoming");
        }

        overlay = <div css={{
            ...overlayBaseCss,
            ...currentlyLive ? { backgroundColor: "rgba(200, 0, 0, 0.9)" } : {},
        }}>
            {innerOverlay}
        </div>;
    } else if (event.syncedData) {
        overlay = <div css={overlayBaseCss}>{formatDuration(event.syncedData.duration)}</div>;
    }

    return (
        <div css={{
            position: "relative",
            transition: "0.2s box-shadow",
            overflow: "hidden",
            height: "fit-content",
            borderRadius: 8,
            // TODO: Not supported by Safari 14.1. Maybe used padding trick instead!
            aspectRatio: "16 / 9",
        }} {...rest}>
            {inner}
            {active && <ActiveIndicator />}
            {overlay}
        </div>
    );
};

const ActiveIndicator = () => (
    <div css={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: "rgba(255, 255, 255, 0.3)",
        borderRadius: 8,
    }} />
);


/**
 * Takes a video duration in milliseconds and returns a formatted string in
 * `HH:MM:SS` or `MM:SS` format.
 */
export const formatDuration = (totalMs: number): string => {
    const totalSeconds = Math.round(totalMs / 1000);
    const seconds = totalSeconds % 60;
    const minutes = Math.floor(totalSeconds / 60) % 60;
    const hours = Math.floor(totalSeconds / (60 * 60));

    const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`);

    if (hours > 0) {
        return `${hours}:${pad(minutes)}:${pad(seconds)}`;
    } else {
        return `${minutes}:${pad(seconds)}`;
    }
};

export const isPastLiveEvent = (endTime: string | null, isLive: boolean): boolean =>
    isLive && endTime != null && new Date(endTime) < new Date();

const ThumbnailImg: React.FC<{ src: string; alt: string }> = ({ src, alt }) => {
    const { t } = useTranslation();
    const [loadError, setLoadError] = useState(false);

    return loadError
        ? <div css={{
            backgroundColor: "var(--grey40)",
            aspectRatio: "16 / 9",
            width: "100%",
            display: "flex",
            flexDirection: "column",
            gap: 8,
            justifyContent: "center",
            alignItems: "center",
            color: "var(--grey92)",
            fontSize: 14,
            "& > svg": {
                fontSize: 32,
                color: "var(--grey80)",
                strokeWidth: 1.5,
            },
        }}>
            <FiAlertTriangle />
            {t("general.failed-to-load-thumbnail")}
        </div>
        : <img
            {...{ src, alt }}
            onError={() => setLoadError(true)}
            loading="lazy"
            width={16}
            height={9}
            css={{
                display: "block",
                width: "100%",
                height: "100%",
                objectFit: "contain",
                backgroundColor: "black",
            }}
        />;
};

type CreatorsProps = {
    creators: readonly string[] | null;
    className?: string;
};

/**
 * Shows a list of creators (of a video) separated by '•' with a leading user
 * icon. If the given creators are null or empty, renders nothing.
 */
export const Creators: React.FC<CreatorsProps> = ({ creators, className }) => (
    creators == null || creators.length === 0
        ? null
        : <div
            css={{
                display: "flex",
                alignItems: "center",
                fontSize: 14,
                gap: 8,
            }}
            {...{ className }}
        >
            <HiOutlineUserCircle css={{
                color: "var(--grey40)",
                fontSize: 16,
                flexShrink: 0,
            }} />
            <ul css={{
                listStyle: "none",
                display: "inline-flex",
                flexWrap: "wrap",
                margin: 0,
                padding: 0,
                "& > li:not(:last-child)::after": {
                    content: "'•'",
                    padding: "0 6px",
                    color: "var(--grey65)",
                },
            }}>
                {creators.map((c, i) => <li key={i}>{c}</li>)}
            </ul>
        </div>
);
