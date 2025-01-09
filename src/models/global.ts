// 全局共享数据示例
import { useModel } from '@umijs/max';
import { useState } from 'react';

const useUser = () => {
  const { age } = useModel('aaa.user');
  console.log('useUser age', age);
  const [name, setName] = useState<string>('ronnie');
  return {
    name,
    setName,
  };
};

export default useUser;
