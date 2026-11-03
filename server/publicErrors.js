// Only explicitly authored user messages cross the API boundary.
class UserFacingError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.publicMessage = message;
    this.status = status;
  }
}
function publicFailure(error, fallback = '操作未完成，请稍后重试') {
  const status = Number.isInteger(error?.status) && error.status >= 400 && error.status <= 599 ? error.status : 500;
  const message = error instanceof UserFacingError ? error.publicMessage
    : status === 404 ? '内容不存在，请刷新页面后重试'
    : status === 413 ? '文件过大，请缩小文件后重试'
    : fallback;
  return { status, message };
}
function respondFailure(res, error, fallback) {
  const { status, message } = publicFailure(error, fallback);
  return res.status(status).json({ error: message });
}
module.exports = { UserFacingError, publicFailure, respondFailure };
