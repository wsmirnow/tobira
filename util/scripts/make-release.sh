#!/usr/bin/env bash

GIT_REMOTE="git@github.com:elan-ev/tobira.git"


basedir=$(dirname "$0")
cd "$basedir"/../.. || exit 1

# Make sure the master branch is checked out and the workdir is clean.
if [[ -n "$(git status --porcelain --untracked-files=no)" ]]; then
    echo "The git working directory is not clean. Stopping."
    exit 1;
fi

if [[ $(git branch --show-current) != master ]]; then
    echo "You are not on the 'master' branch. Stopping."
    exit 1
fi


# Make sure the passed version identifier is valid
if [[ $# -ne 1 ]]; then
    echo "You have to pass the new version as argument!"
    exit 1
fi

if [[ ! $1 =~ ^v[0-9]+\.[0-9]+$ ]]; then
    echo "Invalid version identifier! Needs to be in the form 'v4.23'"
    exit 1
fi

# Split version identifier
tag_name=$1
num=${tag_name#v}
major=${num%.*}
minor=${num#*.}


# Get old version from Cargo.toml
old_version=$(sed -n -E 's/^version = "([^"]+)"$/\1/p' backend/Cargo.toml)
if [[ $old_version != *.0 ]]; then
    echo "Version in Cargo.toml does not end with '.0'. That's not allowed."
    exit 1
fi

old_version_without_patch=${old_version%.0}
old_major=${old_version_without_patch%.*}
old_minor=${old_version_without_patch#*.}


echo -e "Bumping \e[1;94mv$old_major.$old_minor\e[0m  →  \e[1;92mv$major.$minor\e[0m"

# Make sure it's a valid version bump
if (( ! ( (major == old_major + 1 && minor == 0) || (major == old_major && minor == old_minor + 1 ) ) )); then
    echo "Invalid version bump. Either increase major by one and set minor to 0, or increase minor by one."
    exit 1
fi

# Make sure the tag does not exist already
if [[ "$(git tag -l "$tag_name")" ]]; then
    echo "Git tag '$tag_name' already exists"
    exit 1
fi


# Final prompt before changing anything.
echo "Ready. Will now adjust 'Cargo.toml', 'Cargo.lock' and 'docs/versions.txt', commit change, create git tag, and push 'master' and the new tag. Ok?"
echo "(Pushing to $GIT_REMOTE. Make sure you have push access.)"
echo "To cancel, ctrl+c! To continue, press enter."
read -r


# For the rest of the script, stop on error
set -e

sed -i "1s/^/v$major.$minor\n/" docs/versions.txt
sed -i -E 's/^version = "[^"]+.0"$/version = "'"$major.$minor"'.0"/' backend/Cargo.toml
(cd backend/ && cargo update -p tobira --offline)
git add backend/Cargo.toml backend/Cargo.lock docs/versions.txt
git commit -m "Bump version to $major.$minor"
echo -e "\e[1;32m✔ Committed version bump\e[0m"
echo

git tag "$tag_name"
echo -e "\e[1;32m✔ Created tag $tag_name\e[0m"
echo

git push $GIT_REMOTE "$tag_name"
echo -e "\e[1;32m✔ Pushed tag\e[0m"
echo

git push $GIT_REMOTE master
echo -e "\e[1;32m✔ Pushed to master\e[0m"
echo
