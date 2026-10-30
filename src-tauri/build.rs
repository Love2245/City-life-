fn main() {
    // Android 15+ devices may use 16 KB memory pages. Keep the packaged
    // arm64 shared library loadable on both 4 KB and 16 KB page-size devices.
    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("android") {
        println!("cargo:rustc-cdylib-link-arg=-Wl,-z,max-page-size=16384");
        println!("cargo:rustc-cdylib-link-arg=-Wl,-z,common-page-size=16384");
    }
    tauri_build::build()
}
