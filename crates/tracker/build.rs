//! Generates the feed's message types from the schema, without a system `protoc`.

const PROTO_ROOT: &str = "../../proto";
const FEED: &str = "papaquebec/feed/v1/feed.proto";

fn main() -> Result<(), Box<dyn std::error::Error>> {
    println!("cargo::rerun-if-changed={PROTO_ROOT}");
    let descriptors = protox::compile([FEED], [PROTO_ROOT])?;
    prost_build::compile_fds(descriptors)?;
    Ok(())
}
