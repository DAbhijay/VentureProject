import { loginUser, registerUser } from '../services/auth.service.js';

export const register = async (req, res, next) => {
  try {
    const payload = await registerUser(req.body);
    return res.status(201).json(payload);
  } catch (error) {
    return next(error);
  }
};

export const login = async (req, res, next) => {
  try {
    const payload = await loginUser(req.body);
    return res.status(200).json(payload);
  } catch (error) {
    return next(error);
  }
};
