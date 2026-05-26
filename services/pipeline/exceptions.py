"""流水线异常定义。"""


class PipelineCancelledError(Exception):
    """流水线被用户取消。"""
    pass
