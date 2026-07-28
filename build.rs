const FRONTEND_RELATIVE_DIR: &'static str = "web";

fn main() {
    let current_dir = std::env::current_dir().unwrap();
    // let dist_dir = current_dir.join("dist");
    // if dist_dir.exists() {
    //     std::fs::remove_dir_all(&dist_dir).unwrap();
    //     println!("cargo::warning=🚀 success to remove {}", dist_dir.display());
    // }
    let frontend_dir = current_dir.join(FRONTEND_RELATIVE_DIR);
    if !frontend_dir.exists() {
        panic!("Frontend not found");
    }

    if !frontend_dir.join("node_modules").exists() {
        println!("cargo::warning=🚀  node_modules not found. Running 'npm install'...");
        let status = std::process::Command::new("pnpm")
            .args(["install"])
            .current_dir(&frontend_dir)
            .status();
        assert!(status.is_ok());
        assert!(status.unwrap().success());
    }

    // 1. 先监控 src 目录本身（用于感知：新增文件、删除文件、重命名）
    println!(
        "cargo::rerun-if-changed={}",
        frontend_dir.join("src").display()
    );
    println!(
        "cargo:rerun-if-changed={}",
        current_dir.join("build.rs").display()
    );

    walkdir::WalkDir::new(frontend_dir.join("src"))
        .follow_root_links(true)
        .into_iter()
        .filter_map(|e| e.ok())
        .filter(|e| e.file_type().is_file())
        .for_each(|e| {
            println!("cargo::rerun-if-changed={}", e.path().display());
        });
    println!("cargo::warning=🚀 Building frontend (Vite)...");
    match std::process::Command::new("pnpm")
        .args(["build"])
        .current_dir(&frontend_dir)
        .status()
    {
        Ok(status) => {
            assert!(status.success());
        }
        Err(e) => {
            panic!("Failed to build frontend: {}", e);
        }
    }
}
