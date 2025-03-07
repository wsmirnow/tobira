---
sidebar_position: 1
---

# Requirements

To run, Tobira requires:

- A Unix system.
- A **PostgreSQL** (≥10) database. For PostgreSQL version 12 and older, you have to manually enable the `pgcrypto` extension!
- [**Meilisearch**](https://www.meilisearch.com/) (currently v0.28.1). For installation, see [Meili's docs](https://docs.meilisearch.com/learn/getting_started/quick_start.html#step-1-setup-and-installation).
- An **Opencast** that satisfies certain condition. See below.


(If you are a developer, check the `util` folder!)



## What Tobira requires of Opencast

Tobira doesn't work with any Opencast instance out of the box.
There are some requirements.

- The Tobira Opencast module needs to be installed.
  This is included in Opencast starting with 12.3 (released 2022-09-21).
  All Tobira releases specify which Opencast version they require.
  If you are using an earlier Opencast, you have to manually include the module in the correct version.

- No static file authorization.
  Tobira links to various assets (thumbnails, videos, ...) on Opencast's servers.
  Most users will only be authenticated against Tobira, not Opencast.
  So all these requests for assets are unauthenticated, from Opencast perspective.
  This means that non-public assets cannot be retrieved, meaning that non-public events will look broken in Tobira.
  So either you disable static file authorization in Opencast or you can only use Tobira for public videos.

  (We are aware that this limitation is annoying and are investigating possible solutions.)

- Opencast needs to accept JWTs created by Tobira.
  See [this document](./jwt) for more information.

- Opencast needs to allow cross origin requests from Tobira.
  Otherwise, things like the video uploader don't work.

- We assume that everyone who has `write` access to something also has `read`
  access. We often don't check the roles allowed to read if we already checked
  the roles allowed to write.

- If you don't have an SSO solution, you need to configure the Opencast redirect endpoint in such a way that
  all users having with access to Studio and/or the Editor can use it, and so that the URLs to these services
  are added to the appropriate allow-list.
