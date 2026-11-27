#!/bin/sh
# Builds what a release carries: `npm run release`.
#
# The app is packaged and signed with the Developer ID Application certificate in the
# keychain, with the hardened runtime (the packager's own signing does it: @electron/osx-sign),
# then sent to Apple to be notarized, and the ticket is stapled to it. It is put in a disk
# image beside a shortcut to Applications, and the image is signed, notarized and stapled too.
# What comes out is dist/Inquisitive-<version>-arm64.dmg, which opens on another Mac with no
# warning.
#
# Notarizing asks Apple with credentials kept in the keychain under a name, which you store
# once yourself (it asks for your Apple ID, an app-specific password and your team ID):
#
#   xcrun notarytool store-credentials inquisitive
#
# The name is "inquisitive" unless NOTARY_PROFILE says another.

set -eu
cd "$(dirname "$0")"

profile="${NOTARY_PROFILE:-inquisitive}"
identity="$(security find-identity -v -p codesigning | awk '/Developer ID Application/ { print $2; exit }')"
[ -n "$identity" ] || { echo "No Developer ID Application certificate is in the keychain." >&2; exit 1; }
version="$(node -p "require('./package.json').version")"
app="dist/Inquisitive-darwin-arm64/Inquisitive.app"
image="dist/Inquisitive-$version-arm64.dmg"

# Sends a file to Apple and waits for the answer; anything but "Accepted" stops the release,
# with what Apple said of it.
notarize() {
  sent="$(xcrun notarytool submit "$1" --keychain-profile "$profile" --wait 2>&1)" || { echo "$sent" >&2; exit 1; }
  echo "$sent" | tail -4
  if ! echo "$sent" | grep -q 'status: Accepted'; then
    id="$(echo "$sent" | awk '/^ *id:/ { print $2; exit }')"
    [ -n "$id" ] && xcrun notarytool log "$id" --keychain-profile "$profile" >&2
    exit 1
  fi
}

echo "Packaging and signing $version"
npm run --silent pack -- --osx-sign.identity="$identity"
codesign --verify --deep --strict "$app"

echo "Notarizing the app"
ditto -c -k --keepParent "$app" dist/Inquisitive.zip
notarize dist/Inquisitive.zip
rm dist/Inquisitive.zip
xcrun stapler staple "$app"

echo "Making the disk image"
stage="$(mktemp -d)"
trap 'rm -rf "$stage"' EXIT
ditto "$app" "$stage/Inquisitive.app"
ln -s /Applications "$stage/Applications"
rm -f "$image"
hdiutil create -volname Inquisitive -srcfolder "$stage" -ov -format UDZO -fs HFS+ "$image" > /dev/null
codesign --sign "$identity" --timestamp "$image"

echo "Notarizing the disk image"
notarize "$image"
xcrun stapler staple "$image"

# What Gatekeeper makes of each, as another Mac would ask it.
spctl -a -t exec -vv "$app"
spctl -a -t open --context context:primary-signature -vv "$image"
echo "Made $image"
shasum -a 256 "$image"
