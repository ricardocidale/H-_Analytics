{pkgs}: {
  deps = [
    pkgs.freetype
    pkgs.fontconfig
    pkgs.harfbuzz
    pkgs.libffi
    pkgs.gobject-introspection
    pkgs.gdk-pixbuf
    pkgs.pango
    pkgs.cairo
  ];
}
