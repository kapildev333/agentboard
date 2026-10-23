#!/usr/bin/env bash
# git sequence editor: deletes the pick lines whose hash starts with any word in $DROP.
# Used by rebase-resolve.sh to drop copies of main's commits that carry a foreign author.
todo="$1"
for h in $DROP; do
  sed -i '' -E "/^pick ${h}/d" "$todo"
done
