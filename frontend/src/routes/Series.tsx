import { graphql, useFragment } from "react-relay";
import { useTranslation } from "react-i18next";

import { loadQuery } from "../relay";
import { makeRoute } from "../rauta";
import { SeriesBlockFromSeries } from "../ui/Blocks/Series";
import { RootLoader } from "../layout/Root";
import { Nav } from "../layout/Navigation";
import { PageTitle } from "../layout/header/ui";
import { WaitingPage } from "../ui/Waiting";
import { isSynced } from "../util";

import { NotFound } from "./NotFound";
import { SeriesByOpencastIdQuery } from "./__generated__/SeriesByOpencastIdQuery.graphql";
import { b64regex } from "./util";
import { SeriesByIdQuery } from "./__generated__/SeriesByIdQuery.graphql";
import { SeriesRouteData$key } from "./__generated__/SeriesRouteData.graphql";


export const DirectSeriesOCRoute = makeRoute(url => {
    const regex = new RegExp("^/!s/:([^/]+)$", "u");
    const matches = regex.exec(url.pathname);

    if (!matches) {
        return null;
    }


    const opencastId = decodeURIComponent(matches[1]);
    const query = graphql`
        query SeriesByOpencastIdQuery($id: String!) {
            ... UserData
            series: seriesByOpencastId(id: $id) { ...SeriesRouteData }
            rootRealm { ... NavigationData }
        }
    `;
    const queryRef = loadQuery<SeriesByOpencastIdQuery>(query, { id: opencastId });


    return {
        render: () => <RootLoader
            {...{ query, queryRef }}
            noindex
            nav={data => <Nav fragRef={data.rootRealm} />}
            render={result => <SeriesPage seriesFrag={result.series} />}
        />,
        dispose: () => queryRef.dispose(),
    };
});

export const DirectSeriesRoute = makeRoute(url => {
    const regex = new RegExp(`^/!s/(${b64regex}+)$`, "u");
    const matches = regex.exec(url.pathname);

    if (!matches) {
        return null;
    }


    const id = decodeURIComponent(matches[1]);
    const query = graphql`
        query SeriesByIdQuery($id: ID!) {
            ... UserData
            series: seriesById(id: $id) { ...SeriesRouteData }
            rootRealm { ... NavigationData }
        }
    `;
    const queryRef = loadQuery<SeriesByIdQuery>(query, { id: `sr${id}` });


    return {
        render: () => <RootLoader
            {...{ query, queryRef }}
            noindex
            nav={data => <Nav fragRef={data.rootRealm} />}
            render={result => <SeriesPage seriesFrag={result.series} />}
        />,
        dispose: () => queryRef.dispose(),
    };
});

const fragment = graphql`
    fragment SeriesRouteData on Series {
        title
        syncedData {
            description
        }
        ... SeriesBlockSeriesData
    }
`;

type SeriesPageProps = {
    seriesFrag: SeriesRouteData$key | null;
};

const SeriesPage: React.FC<SeriesPageProps> = ({ seriesFrag }) => {
    const { t } = useTranslation();
    const series = useFragment(fragment, seriesFrag);

    if (!series) {
        return <NotFound kind="series" />;
    }

    if (!isSynced(series)) {
        return <WaitingPage type="series" />;
    }

    return <div css={{ display: "flex", flexDirection: "column" }}>
        <PageTitle title={series.title} />
        <p>{series.syncedData.description}</p>
        <div css={{ marginTop: 12 }}>
            <SeriesBlockFromSeries
                title={t("series.videos.heading")}
                basePath="/!v"
                fragRef={series}
            />
        </div>
    </div>;
};
