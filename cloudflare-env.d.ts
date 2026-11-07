declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    BID_COMPASS_TEST_MODE?: string;
    BUCKET?: R2Bucket;
  }
}
