-- 1104批次2步骤四: 验证码清理定时器需要 DELETE 权限(原 migration 只授了 INSERT/SELECT/UPDATE)
-- 事故实证: 上线首跑报 permission denied for table sms_codes, 被 catch 吞进日志
GRANT DELETE ON sms_codes TO jamony_api;
