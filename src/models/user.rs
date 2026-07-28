#[derive(Debug, toasty::Model)]
pub(crate) struct User{
    #[key]
    #[auto]
    pub(crate) id: u64,
    #[index]
    pub(crate) username: String,
    pub(crate) password: String,
}