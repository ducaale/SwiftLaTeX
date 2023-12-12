mergeInto(LibraryManager.library, {
  kpse_find_file_js: function(nameptr, format, _mustexist) {
    return kpse_find_file_impl(nameptr, format);
  },
  kpse_find_pk_js: function(nameptr, dpi) {
    return kpse_find_pk_impl(nameptr, dpi);
  }
});
