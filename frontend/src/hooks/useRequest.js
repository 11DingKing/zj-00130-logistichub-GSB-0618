import { useState, useEffect, useCallback, useRef } from "react";
import { message } from "antd";

export const useRequest = (requestFn, autoRun = true) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const requestFnRef = useRef(requestFn);

  useEffect(() => {
    requestFnRef.current = requestFn;
  }, [requestFn]);

  const run = useCallback(async (...args) => {
    setLoading(true);
    setError(null);
    try {
      const response = await requestFnRef.current(...args);
      setData(response.data);
      return response.data;
    } catch (err) {
      const errorMsg = err.response?.data?.error || err.message || "请求失败";
      setError(errorMsg);
      message.error(errorMsg);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (autoRun) {
      run();
    }
  }, [run, autoRun]);

  const refresh = useCallback(() => {
    return run();
  }, [run]);

  return { data, loading, error, run, setData, refresh };
};

export const useTableRequest = (requestFn) => {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [pagination, setPagination] = useState({
    current: 1,
    pageSize: 10,
    total: 0,
  });

  const fetchData = useCallback(
    async (params = {}) => {
      setLoading(true);
      try {
        const response = await requestFn({
          ...params,
          page: pagination.current,
          pageSize: pagination.pageSize,
        });
        setData(response.data);
        setPagination((prev) => ({
          ...prev,
          total: Array.isArray(response.data) ? response.data.length : 0,
        }));
      } catch (err) {
        message.error(err.response?.data?.error || "加载数据失败");
      } finally {
        setLoading(false);
      }
    },
    [requestFn, pagination.current, pagination.pageSize],
  );

  return { data, loading, pagination, fetchData, setData };
};
