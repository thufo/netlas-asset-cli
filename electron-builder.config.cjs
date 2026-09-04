const platform = process.env.BUILD_PLATFORM || process.platform;
const arch = process.env.BUILD_ARCH || process.arch;
const updateChannel = `latest-${platform}-${arch}`;

module.exports = {
  appId: "io.github.thufo.netlasasset",
  productName: "Netlas Asset",
  directories: { output: "release/desktop", buildResources: "build-resources" },
  files: ["dist/main/**/*", "dist/preload/**/*", "dist/renderer/**/*", "package.json", "LICENSE"],
  asar: true,
  npmRebuild: false,
  publish: [{ provider: "github", owner: "thufo", repo: "netlas-asset-cli", channel: updateChannel }],
  win: {
    target: [
      { target: "nsis", arch: [arch] },
      { target: "portable", arch: [arch] }
    ]
  },
  nsis: {
    oneClick: false,
    allowToChangeInstallationDirectory: true,
    createDesktopShortcut: true,
    createStartMenuShortcut: true,
    artifactName: `netlas-asset-desktop-\${version}-windows-${arch}-setup.\${ext}`
  },
  portable: {
    artifactName: `netlas-asset-desktop-\${version}-windows-${arch}-portable.\${ext}`
  },
  linux: {
    category: "Network",
    target: [
      { target: "AppImage", arch: [arch] },
      { target: "deb", arch: [arch] }
    ],
    synopsis: "Authorized Netlas asset lookups",
    description: "Multilingual desktop client for focused, authorized Netlas asset lookups"
  },
  appImage: { artifactName: `netlas-asset-desktop-\${version}-linux-${arch}.\${ext}` },
  deb: { artifactName: `netlas-asset-desktop-\${version}-linux-${arch}.\${ext}` }
};
